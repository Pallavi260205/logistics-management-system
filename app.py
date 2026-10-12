from flask import Flask, render_template, request, redirect, session, send_file, jsonify, flash
import os, random, datetime, smtplib, sqlite3

# load .env if possible
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# optional packages
try:
    from flask_jwt_extended import (
        JWTManager, create_access_token, jwt_required, get_jwt_identity
    )
except ImportError:
    JWTManager = create_access_token = jwt_required = get_jwt_identity = None

try:
    from reportlab.pdfgen import canvas
except ImportError:
    canvas = None

try:
    import requests
except ImportError:
    requests = None

try:
    from twilio.rest import Client
except ImportError:
    Client = None

# --- App setup ---------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "secretkey123")

if JWTManager:
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET", "jwt-secret-123")
    jwt = JWTManager(app)
else:
    jwt = None

DB_PATH = os.path.join(os.path.dirname(__file__), "logistics.db")


# --- SQLite helpers ----------------------------------------------------------

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables and add new columns idempotently."""
    conn = get_connection()
    cur = conn.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT,
            email    TEXT UNIQUE,
            password TEXT,
            phone    TEXT,
            role     TEXT DEFAULT 'customer'
        );

        CREATE TABLE IF NOT EXISTS orders (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER REFERENCES users(id),
            product_name   TEXT,
            quantity       INTEGER,
            address        TEXT,
            city           TEXT,
            pincode        TEXT,
            payment_method TEXT,
            payment_status TEXT DEFAULT 'Pending',
            status         TEXT DEFAULT 'Pending',
            cost           REAL DEFAULT 0,
            distance_km    REAL DEFAULT 0,
            express        INTEGER DEFAULT 0,
            otp            TEXT,
            invoice_file   TEXT
        );
    """)
    # Safely add new columns if they don't exist
    for col, definition in [
        ("shipper_id",     "INTEGER REFERENCES users(id)"),
        ("shipper_status", "TEXT DEFAULT 'Unassigned'"),
    ]:
        try:
            cur.execute(f"ALTER TABLE orders ADD COLUMN {col} {definition}")
        except sqlite3.OperationalError:
            pass  # Column already exists

    # Migrate legacy 'user' role to 'customer'
    cur.execute("UPDATE users SET role = 'customer' WHERE role = 'user'")

    conn.commit()
    conn.close()


init_db()


# --- Cost & distance utilities -----------------------------------------------

def calculate_distance(to_address: str) -> float:
    key = os.environ.get("GOOGLE_MAPS_KEY")
    origin = os.environ.get("WAREHOUSE_ADDRESS", "Warehouse")
    if key and requests:
        try:
            r = requests.get(
                "https://maps.googleapis.com/maps/api/distancematrix/json",
                params={"origins": origin, "destinations": to_address, "key": key},
                timeout=5,
            )
            data = r.json()
            return data["rows"][0]["elements"][0]["distance"]["value"] / 1000.0
        except Exception as e:
            print("maps error", e)
    return round(random.uniform(1, 20), 2)


def calculate_cost(distance: float, express: bool) -> float:
    base   = float(os.environ.get("BASE_COST",   50))
    per_km = float(os.environ.get("COST_PER_KM",  5))
    total  = base + distance * per_km
    if express:
        total += float(os.environ.get("EXPRESS_FEE", 100))
    return round(total, 2)


# --- Notification helpers ----------------------------------------------------

def send_email(to_addr: str, subject: str, body: str) -> bool:
    server = os.environ.get("SMTP_SERVER")
    if not server:
        return False
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ.get("SMTP_USER")
    pwd  = os.environ.get("SMTP_PASS")
    try:
        with smtplib.SMTP(server, port) as smtp:
            smtp.starttls()
            smtp.login(user, pwd)
            smtp.sendmail(user, to_addr, f"Subject: {subject}\n\n{body}")
        return True
    except Exception as e:
        print("email send failed", e)
        return False


def send_sms(to_number: str, body: str) -> bool:
    if not Client:
        return False
    sid      = os.environ.get("TWILIO_SID")
    token    = os.environ.get("TWILIO_TOKEN")
    from_num = os.environ.get("TWILIO_FROM")
    if not all([sid, token, from_num]):
        return False
    try:
        Client(sid, token).messages.create(to=to_number, from_=from_num, body=body)
        return True
    except Exception as e:
        print("sms send failed", e)
        return False


# --- Auth helpers ------------------------------------------------------------

def require_role(*roles):
    """Returns redirect if session role not in allowed roles."""
    role = session.get("role")
    if not role:
        return redirect("/login")
    if role not in roles:
        return redirect("/dashboard")
    return None


# --- Routes ------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/dashboard", methods=["GET", "POST"])
def dashboard():
    """Smart redirect based on role."""
    if request.method == "POST":
        return redirect("/dashboard")
    role = session.get("role")
    if not role:
        return redirect("/login")
    if role == "admin":
        return redirect("/admin")
    if role == "shipper":
        return redirect("/shipper")
    return redirect("/customer")


@app.route("/register", methods=["GET", "POST"])
def register():
    error = None
    if request.method == "POST":
        name     = request.form["name"]
        email    = request.form["email"]
        password = request.form["password"]
        phone    = request.form.get("phone")
        role     = request.form.get("role", "customer")
        # Validate role
        if role not in ("customer", "shipper", "admin"):
            role = "customer"
        try:
            conn = get_connection()
            conn.execute(
                "INSERT INTO users (name,email,password,phone,role) VALUES (?,?,?,?,?)",
                (name, email, password, phone, role),
            )
            conn.commit()
            conn.close()
            return redirect("/login")
        except sqlite3.IntegrityError:
            error = "Email already registered. Please login."
            conn.close()
    return render_template("register.html", error=error)


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        email    = request.form["email"]
        password = request.form["password"]
        conn = get_connection()
        user = conn.execute(
            "SELECT id, role, name FROM users WHERE email=? AND password=?",
            (email, password),
        ).fetchone()
        conn.close()
        if user:
            session["user_id"]   = user["id"]
            session["role"]      = "customer" if user["role"] == "user" else user["role"]
            session["user_name"] = user["name"]
            return redirect("/dashboard")
        error = "Invalid email or password."
    return render_template("login.html", error=error)


@app.route("/api/login", methods=["POST"])
def api_login():
    if not create_access_token:
        return jsonify({"msg": "JWT support not installed"}), 500
    data     = request.get_json()
    email    = data.get("email")
    password = data.get("password")
    conn = get_connection()
    user = conn.execute(
        "SELECT id, role FROM users WHERE email=? AND password=?",
        (email, password),
    ).fetchone()
    conn.close()
    if not user:
        return jsonify({"msg": "Bad email or password"}), 401
    access_token = create_access_token(identity={"id": user["id"], "role": user["role"]})
    return jsonify(access_token=access_token)


# =============================================================================
# CUSTOMER ROUTES
# =============================================================================

@app.route("/customer", methods=["GET", "POST"])
def customer():
    redir = require_role("customer")
    if redir:
        return redir
    user_id = session["user_id"]

    if request.method == "POST":
        product      = request.form["product"]
        quantity     = request.form["quantity"]
        address      = request.form["address"]
        city         = request.form["city"]
        pincode      = request.form["pincode"]
        payment      = request.form["payment"]
        express      = request.form.get("express") == "on"
        distance     = calculate_distance(address)
        cost         = calculate_cost(distance, express)
        invoice_file = None

        if "invoice" in request.files:
            f = request.files["invoice"]
            if f.filename:
                os.makedirs("uploads", exist_ok=True)
                path = os.path.join("uploads", f.filename)
                f.save(path)
                invoice_file = path

        conn = get_connection()
        conn.execute(
            """INSERT INTO orders
               (user_id, product_name, quantity, address, city, pincode,
                payment_method, status, cost, distance_km, express, invoice_file,
                shipper_status)
               VALUES (?,?,?,?,?,?,?,'Pending',?,?,?,?,'Unassigned')""",
            (user_id, product, quantity, address, city, pincode,
             payment, cost, distance, 1 if express else 0, invoice_file),
        )
        conn.commit()
        conn.close()
        flash("Order placed successfully!", "success")
        return redirect("/customer")

    conn   = get_connection()
    orders = conn.execute(
        """SELECT o.id, o.product_name, o.quantity, o.address, o.status,
                  o.cost, o.otp, o.shipper_status, o.express,
                  u.name as shipper_name
           FROM orders o
           LEFT JOIN users u ON u.id = o.shipper_id
           WHERE o.user_id=? ORDER BY o.id DESC""",
        (user_id,),
    ).fetchall()
    conn.close()
    orders = [dict(o) for o in orders]

    conn = get_connection()
    row  = conn.execute(
        "SELECT COUNT(*) as t, SUM(cost) as r FROM orders WHERE user_id=?", (user_id,)
    ).fetchone()
    delivered = conn.execute(
        "SELECT COUNT(*) as d FROM orders WHERE user_id=? AND status='Delivered'", (user_id,)
    ).fetchone()["d"]
    pending = conn.execute(
        "SELECT COUNT(*) as p FROM orders WHERE user_id=? AND status!='Delivered'", (user_id,)
    ).fetchone()["p"]
    conn.close()

    stats = {
        "total":     row["t"] or 0,
        "delivered": delivered,
        "pending":   pending,
        "revenue":   round(row["r"] or 0, 2),
    }
    return render_template(
        "customer_dashboard.html",
        orders=orders,
        stats=stats,
        user_name=session.get("user_name", ""),
        google_maps_key=os.environ.get("GOOGLE_MAPS_KEY"),
        express_fee=os.environ.get("EXPRESS_FEE", 100),
    )


@app.route("/verify_otp/<int:order_id>", methods=["POST"])
def verify_otp(order_id):
    submitted = request.form.get("otp")
    conn = get_connection()
    row  = conn.execute("SELECT otp FROM orders WHERE id=?", (order_id,)).fetchone()
    if row and row["otp"] == submitted:
        conn.execute("UPDATE orders SET status='Delivered', shipper_status='Delivered' WHERE id=?", (order_id,))
        conn.commit()
        flash("OTP verified. Order marked as Delivered!", "success")
    else:
        flash("Invalid OTP. Please try again.", "error")
    conn.close()
    # Redirect back to caller's role dashboard
    role = session.get("role", "customer")
    if role == "shipper":
        return redirect("/shipper")
    return redirect("/customer")


# =============================================================================
# SHIPPER ROUTES
# =============================================================================

@app.route("/shipper")
def shipper():
    redir = require_role("shipper")
    if redir:
        return redir
    shipper_id = session["user_id"]

    conn = get_connection()
    orders = conn.execute(
        """SELECT o.id, o.product_name, o.quantity, o.address, o.city,
                  o.pincode, o.status, o.shipper_status, o.cost,
                  o.express, o.otp, u.name as customer_name, u.phone as customer_phone
           FROM orders o
           JOIN users u ON u.id = o.user_id
           WHERE o.shipper_id=? ORDER BY o.id DESC""",
        (shipper_id,),
    ).fetchall()

    # Query unassigned orders (notifications type 1)
    unassigned_orders = conn.execute(
        """SELECT o.id, o.product_name, o.quantity, o.address, o.city,
                  o.pincode, o.status, o.shipper_status, o.cost,
                  o.express, u.name as customer_name, u.phone as customer_phone
           FROM orders o
           JOIN users u ON u.id = o.user_id
           WHERE o.shipper_id IS NULL AND o.shipper_status = 'Unassigned'
           ORDER BY o.id DESC"""
    ).fetchall()

    # Query newly assigned orders for this shipper (notifications type 2)
    assigned_notifications = conn.execute(
        """SELECT o.id, o.product_name, o.quantity, o.address, o.city,
                  o.pincode, o.status, o.shipper_status, o.cost,
                  o.express, u.name as customer_name, u.phone as customer_phone
           FROM orders o
           JOIN users u ON u.id = o.user_id
           WHERE o.shipper_id=? AND o.shipper_status='Assigned'
           ORDER BY o.id DESC""",
        (shipper_id,),
    ).fetchall()
    conn.close()

    orders = [dict(o) for o in orders]
    unassigned_orders = [dict(o) for o in unassigned_orders]
    assigned_notifications = [dict(o) for o in assigned_notifications]
    notifications_count = len(unassigned_orders) + len(assigned_notifications)

    conn = get_connection()
    total     = conn.execute("SELECT COUNT(*) FROM orders WHERE shipper_id=?", (shipper_id,)).fetchone()[0]
    delivered = conn.execute("SELECT COUNT(*) FROM orders WHERE shipper_id=? AND shipper_status='Delivered'", (shipper_id,)).fetchone()[0]
    active    = conn.execute("SELECT COUNT(*) FROM orders WHERE shipper_id=? AND shipper_status NOT IN ('Delivered','Unassigned')", (shipper_id,)).fetchone()[0]
    earnings  = conn.execute("SELECT SUM(cost)*0.1 FROM orders WHERE shipper_id=? AND shipper_status='Delivered'", (shipper_id,)).fetchone()[0] or 0
    conn.close()

    stats = {
        "total":     total,
        "delivered": delivered,
        "active":    active,
        "earnings":  round(earnings, 2),
    }
    return render_template(
        "shipper_dashboard.html",
        orders=orders,
        unassigned_orders=unassigned_orders,
        assigned_notifications=assigned_notifications,
        notifications_count=notifications_count,
        stats=stats,
        user_name=session.get("user_name", ""),
    )


@app.route("/shipper/claim/<int:order_id>")
def shipper_claim(order_id):
    redir = require_role("shipper")
    if redir:
        return redir
    shipper_id = session["user_id"]

    conn = get_connection()
    order = conn.execute(
        "SELECT id FROM orders WHERE id=? AND shipper_id IS NULL AND shipper_status='Unassigned'",
        (order_id,)
    ).fetchone()

    if not order:
        conn.close()
        flash("Order is no longer available to claim.", "error")
        return redirect("/shipper")

    conn.execute(
        "UPDATE orders SET shipper_id=?, shipper_status='Accepted', status='Confirmed' WHERE id=?",
        (shipper_id, order_id)
    )
    conn.commit()
    conn.close()
    flash("Successfully claimed order!", "success")
    return redirect("/shipper")



@app.route("/shipper/update/<int:order_id>/<new_status>")
def shipper_update(order_id, new_status):
    redir = require_role("shipper")
    if redir:
        return redir

    # "Delivered" is NOT allowed here — delivery must go through verify_otp (OTP check)
    valid = ["Accepted", "Picked Up", "In Transit"]
    if new_status not in valid:
        flash("Invalid status transition.", "error")
        return redirect("/shipper")

    conn = get_connection()
    # Verify this order belongs to this shipper
    row = conn.execute(
        "SELECT id, user_id FROM orders WHERE id=? AND shipper_id=?",
        (order_id, session["user_id"])
    ).fetchone()
    if not row:
        conn.close()
        return redirect("/shipper")

    conn.execute("UPDATE orders SET shipper_status=? WHERE id=?", (new_status, order_id))

    # Mirror to main status for customer visibility
    status_map = {
        "Accepted":   "Confirmed",
        "Picked Up":  "Shipped",
        "In Transit": "Shipped",
        "Delivered":  "Delivered",
    }
    conn.execute("UPDATE orders SET status=? WHERE id=?", (status_map[new_status], order_id))

    # Generate OTP when shipper marks In Transit
    if new_status == "In Transit":
        otp = str(random.randint(100000, 999999))
        conn.execute("UPDATE orders SET otp=? WHERE id=?", (otp, order_id))
        user = conn.execute(
            "SELECT u.email, u.phone FROM users u JOIN orders o ON u.id=o.user_id WHERE o.id=?",
            (order_id,),
        ).fetchone()
        if user:
            send_email(user["email"], "Your Delivery OTP", f"Your delivery OTP is: {otp}")
            send_sms(user["phone"], f"Your delivery OTP is: {otp}")

    conn.commit()
    conn.close()
    flash(f"Order status updated to {new_status}!", "success")
    return redirect("/shipper")


@app.route("/shipper/send_otp/<int:order_id>")
def shipper_send_otp(order_id):
    redir = require_role("shipper")
    if redir:
        return redir

    conn = get_connection()
    # Verify this order belongs to this shipper
    row = conn.execute(
        "SELECT id, user_id FROM orders WHERE id=? AND shipper_id=?",
        (order_id, session["user_id"])
    ).fetchone()
    if not row:
        conn.close()
        flash("Unauthorized or order not found.", "error")
        return redirect("/shipper")

    # Generate new OTP
    otp = str(random.randint(100000, 999999))
    conn.execute("UPDATE orders SET otp=? WHERE id=?", (otp, order_id))

    # Fetch customer details
    user = conn.execute(
        "SELECT u.email, u.phone FROM users u JOIN orders o ON u.id=o.user_id WHERE o.id=?",
        (order_id,),
    ).fetchone()

    if user:
        send_email(user["email"], "Your Delivery OTP", f"Your delivery OTP is: {otp}")
        send_sms(user["phone"], f"Your delivery OTP is: {otp}")

    conn.commit()
    conn.close()
    flash("New OTP generated and sent to customer!", "success")
    return redirect("/shipper")


# =============================================================================
# ADMIN ROUTES
# =============================================================================

@app.route("/admin")
def admin():
    redir = require_role("admin")
    if redir:
        return redir

    conn = get_connection()
    orders = conn.execute(
        """SELECT o.id, o.product_name, o.quantity, o.status, o.shipper_status,
                  o.cost, o.city, o.pincode, o.address, o.express,
                  c.name as customer_name,
                  s.name as shipper_name,
                  o.shipper_id
           FROM orders o
           JOIN users c ON c.id = o.user_id
           LEFT JOIN users s ON s.id = o.shipper_id
           ORDER BY o.id DESC"""
    ).fetchall()

    shippers = conn.execute(
        "SELECT id, name, phone FROM users WHERE role='shipper' ORDER BY name"
    ).fetchall()

    customers = conn.execute(
        "SELECT id, name, email, phone FROM users WHERE role='customer' ORDER BY name"
    ).fetchall()

    # Metrics
    total_orders  = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    total_revenue = conn.execute("SELECT SUM(cost) FROM orders").fetchone()[0] or 0
    delivered     = conn.execute("SELECT COUNT(*) FROM orders WHERE status='Delivered'").fetchone()[0]
    pending       = conn.execute("SELECT COUNT(*) FROM orders WHERE status='Pending'").fetchone()[0]
    conn.close()

    stats = {
        "total_orders":  total_orders,
        "total_revenue": round(total_revenue, 2),
        "delivered":     delivered,
        "pending":       pending,
    }

    return render_template(
        "admin.html",
        orders=[dict(o) for o in orders],
        shippers=[dict(s) for s in shippers],
        customers=[dict(c) for c in customers],
        stats=stats,
        user_name=session.get("user_name", ""),
    )


@app.route("/admin/assign/<int:order_id>/<int:shipper_id>")
def admin_assign(order_id, shipper_id):
    redir = require_role("admin")
    if redir:
        return redir
    conn = get_connection()
    conn.execute(
        "UPDATE orders SET shipper_id=?, shipper_status='Assigned', status='Confirmed' WHERE id=?",
        (shipper_id, order_id)
    )
    conn.commit()
    conn.close()
    flash("Shipper assigned successfully!", "success")
    return redirect("/admin")


@app.route("/update_status/<int:order_id>/<new_status>")
def update_status(order_id, new_status):
    """Legacy admin status update (kept for compatibility)."""
    redir = require_role("admin")
    if redir:
        return redir
    conn = get_connection()
    conn.execute("UPDATE orders SET status=? WHERE id=?", (new_status, order_id))
    if new_status == "Delivered":
        otp = str(random.randint(100000, 999999))
        conn.execute("UPDATE orders SET otp=?, shipper_status='Delivered' WHERE id=?", (otp, order_id))
        user = conn.execute(
            "SELECT u.email, u.phone FROM users u JOIN orders o ON u.id=o.user_id WHERE o.id=?",
            (order_id,),
        ).fetchone()
        if user:
            send_email(user["email"], "Delivery OTP", f"Your OTP is {otp}")
            send_sms(user["phone"], f"Your OTP is {otp}")
    conn.commit()
    conn.close()
    return redirect("/admin")


@app.route("/invoice/<int:order_id>")
def invoice(order_id):
    conn = get_connection()
    row  = conn.execute("SELECT invoice_file FROM orders WHERE id=?", (order_id,)).fetchone()
    conn.close()
    if row and row[0] and os.path.exists(row[0]):
        return send_file(row[0], as_attachment=True)
    file_path = f"invoice_{order_id}.pdf"
    if canvas:
        c = canvas.Canvas(file_path)
        c.drawString(100, 750, "Logistics Invoice")
        c.drawString(100, 730, f"Order ID: {order_id}")
        c.drawString(100, 710, "Thank you for your purchase!")
        c.save()
        return send_file(file_path, as_attachment=True)
    return "reportlab not installed, cannot generate PDF", 500


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")





if __name__ == "__main__":
    app.run(debug=True)
