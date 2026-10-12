from flask import Flask, render_template, request, redirect, session, send_file, jsonify
# pyrefly: ignore [missing-import]
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required,
    get_jwt_identity
)
import psycopg2
from reportlab.pdfgen import canvas
import os, random, datetime, smtplib, requests
from twilio.rest import Client

# --- configuration and helpers ------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "secretkey123")
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET", "jwt-secret-123")
jwt = JWTManager(app)

# Database connection helper

def get_connection():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST",
                           "aws-1-ap-southeast-1.pooler.supabase.com"),
        database=os.environ.get("DB_NAME", "postgres"),
        user=os.environ.get("DB_USER",
                           "postgres.juucqoiuszpfsjwohete"),
        password=os.environ.get("DB_PASS", "Pallurao@55"),
        port=os.environ.get("DB_PORT", "5432"),
        sslmode="require"
    )


def init_db():
    """Create tables if they don't exist (idempotent)."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            phone TEXT,
            role TEXT DEFAULT 'user'
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            product_name TEXT,
            quantity INTEGER,
            address TEXT,
            city TEXT,
            pincode TEXT,
            payment_method TEXT,
            payment_status TEXT DEFAULT 'Pending',
            status TEXT DEFAULT 'Pending',
            cost NUMERIC DEFAULT 0,
            distance_km NUMERIC DEFAULT 0,
            express BOOLEAN DEFAULT FALSE,
            otp TEXT,
            invoice_file TEXT
        );
        """
    )
    conn.commit()
    cur.close()
    conn.close()


init_db()


# cost & distance utilities ----------------------------------------------------

def calculate_distance(to_address: str) -> float:
    """Return distance in kilometres between warehouse and destination.

    If GOOGLE_MAPS_KEY is provided the distance matrix API is used, otherwise a
    randomized placeholder value is returned (useful for offline/dev).
    """
    key = os.environ.get("GOOGLE_MAPS_KEY")
    origin = os.environ.get("WAREHOUSE_ADDRESS", "Warehouse")
    if key:
        try:
            r = requests.get(
                "https://maps.googleapis.com/maps/api/distancematrix/json",
                params={
                    "origins": origin,
                    "destinations": to_address,
                    "key": key,
                },
                timeout=5,
            )
            data = r.json()
            return data["rows"][0]["elements"][0]["distance"]["value"] / 1000.0
        except Exception as e:
            print("maps error", e)
    # fallback
    return round(random.uniform(1, 20), 2)


def calculate_cost(distance: float, express: bool) -> float:
    base = float(os.environ.get("BASE_COST", 50))
    per_km = float(os.environ.get("COST_PER_KM", 5))
    total = base + distance * per_km
    if express:
        total += float(os.environ.get("EXPRESS_FEE", 100))
    return round(total, 2)


# notification helpers --------------------------------------------------------

def send_email(to_addr: str, subject: str, body: str) -> bool:
    server = os.environ.get("SMTP_SERVER")
    if not server:
        return False
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ.get("SMTP_USER")
    pwd = os.environ.get("SMTP_PASS")
    try:
        with smtplib.SMTP(server, port) as smtp:
            smtp.starttls()
            smtp.login(user, pwd)
            msg = f"Subject: {subject}\n\n{body}"
            smtp.sendmail(user, to_addr, msg)
        return True
    except Exception as e:
        print("email send failed", e)
        return False


def send_sms(to_number: str, body: str) -> bool:
    sid = os.environ.get("TWILIO_SID")
    token = os.environ.get("TWILIO_TOKEN")
    from_num = os.environ.get("TWILIO_FROM")
    if not sid or not token or not from_num:
        return False
    try:
        client = Client(sid, token)
        client.messages.create(to=to_number, from_=from_num, body=body)
        return True
    except Exception as e:
        print("sms send failed", e)
        return False


# --- web/endpoints -----------------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        name = request.form["name"]
        email = request.form["email"]
        password = request.form["password"]
        phone = request.form.get("phone")
        role = request.form.get("role", "user")

        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (name,email,password,phone,role) VALUES (%s,%s,%s,%s,%s)",
            (name, email, password, phone, role),
        )
        conn.commit()
        cur.close()
        conn.close()
        return redirect("/login")
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form["email"]
        password = request.form["password"]
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, role FROM users WHERE email=%s AND password=%s",
            (email, password),
        )
        user = cur.fetchone()
        cur.close()
        conn.close()
        if user:
            session["user_id"] = user[0]
            session["role"] = user[1]
            return redirect("/dashboard")
        return "Invalid Credentials", 401
    return render_template("login.html")


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, role FROM users WHERE email=%s AND password=%s",
        (email, password),
    )
    user = cur.fetchone()
    cur.close()
    conn.close()
    if not user:
        return jsonify({"msg": "Bad email or password"}), 401
    access_token = create_access_token(identity={"id": user[0], "role": user[1]})
    return jsonify(access_token=access_token)


def query_metrics(user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*), SUM(cost) FROM orders WHERE user_id=%s", (user_id,))
    total, revenue = cur.fetchone()
    cur.execute("SELECT COUNT(*) FROM orders WHERE user_id=%s AND status='Delivered'", (user_id,))
    delivered = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM orders WHERE user_id=%s AND status!='Delivered'", (user_id,))
    pending = cur.fetchone()[0]
    cur.close()
    conn.close()
    return total or 0, delivered, pending, revenue or 0


@app.route("/dashboard", methods=["GET", "POST"])
def dashboard():
    if "user_id" not in session:
        return redirect("/login")
    user_id = session["user_id"]
    conn = get_connection()
    cur = conn.cursor()
    # handle new order + file upload
    if request.method == "POST":
        product = request.form["product"]
        quantity = request.form["quantity"]
        address = request.form["address"]
        city = request.form["city"]
        pincode = request.form["pincode"]
        payment = request.form["payment"]
        express = request.form.get("express") == "on"
        distance = calculate_distance(address)
        cost = calculate_cost(distance, express)
        invoice_file = None
        if "invoice" in request.files:
            f = request.files["invoice"]
            if f.filename:
                path = os.path.join("uploads", f.filename)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                f.save(path)
                invoice_file = path
        cur.execute(
            """
            INSERT INTO orders
            (user_id, product_name, quantity, address, city, pincode,
             payment_method, status, cost, distance_km, express, invoice_file)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'Pending',%s,%s,%s,%s)
            """,
            (user_id, product, quantity, address, city, pincode,
             payment, cost, distance, express, invoice_file),
        )
        conn.commit()
    # fetch orders and metrics
    cur.execute(
        "SELECT id, product_name, quantity, address, status, cost, otp FROM orders WHERE user_id=%s ORDER BY id DESC",
        (user_id,),
    )
    orders = cur.fetchall()
    cur.close()
    conn.close()
    total, delivered, pending, revenue = query_metrics(user_id)
    return render_template(
        "dashboard.html",
        orders=orders,
        stats={
            "total": total,
            "delivered": delivered,
            "pending": pending,
            "revenue": revenue,
        },
        google_maps_key=os.environ.get("GOOGLE_MAPS_KEY"),
    )


@app.route("/admin")
@jwt_required()
def admin():
    identity = get_jwt_identity()
    if identity.get("role") != "admin":
        return jsonify({"msg": "Forbidden"}), 403
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, product_name, status FROM orders ORDER BY id DESC")
    orders = cur.fetchall()
    cur.close()
    conn.close()
    return render_template("admin.html", orders=orders)


@app.route("/update_status/<int:order_id>/<new_status>")
def update_status(order_id, new_status):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE orders SET status=%s WHERE id=%s", (new_status, order_id))
    # if delivered send OTP
    if new_status == "Delivered":
        otp = str(random.randint(100000, 999999))
        cur.execute("UPDATE orders SET otp=%s WHERE id=%s", (otp, order_id))
        cur.execute(
            "SELECT u.email, u.phone FROM users u JOIN orders o ON u.id=o.user_id WHERE o.id=%s",
            (order_id,),
        )
        user = cur.fetchone()
        if user:
            email, phone = user
            send_email(email, "Delivery OTP", f"Your OTP is {otp}")
            send_sms(phone, f"Your OTP is {otp}")
    conn.commit()
    cur.close()
    conn.close()
    return redirect("/admin")


@app.route("/verify_otp/<int:order_id>", methods=["POST"])
def verify_otp(order_id):
    submitted = request.form.get("otp")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT otp FROM orders WHERE id=%s", (order_id,))
    row = cur.fetchone()
    if row and row[0] == submitted:
        cur.execute("UPDATE orders SET status='Delivered' WHERE id=%s", (order_id,))
        conn.commit()
        message = "OTP verified, order marked as delivered."
    else:
        message = "Invalid OTP"
    cur.close()
    conn.close()
    return message


@app.route("/invoice/<int:order_id>")
def invoice(order_id):
    # if an uploaded file exists return it, otherwise generate
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT invoice_file FROM orders WHERE id=%s", (order_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row and row[0]:
        return send_file(row[0], as_attachment=True)
    file_path = f"invoice_{order_id}.pdf"
    c = canvas.Canvas(file_path)
    c.drawString(100, 750, "Logistics Invoice")
    c.drawString(100, 730, f"Order ID: {order_id}")
    c.drawString(100, 710, "Thank you for your purchase!")
    c.save()
    return send_file(file_path, as_attachment=True)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


if __name__ == "__main__":
    app.run(debug=True)
