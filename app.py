"""OfferDesk Pro — freemium grade-flip SaaS for sports card dealers.
Free: 3 flip analyses/day. Pro ($49/mo via Stripe): unlimited.
Serves the static frontend + JSON API. Postgres (Neon) when DATABASE_URL is set,
else local SQLite.
"""
import os
import sqlite3
from datetime import date

from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import generate_password_hash, check_password_hash

import stripe

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET") or os.urandom(24)
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

DATABASE_URL = os.environ.get("DATABASE_URL")
USE_PG = bool(DATABASE_URL)

@app.get("/css/<path:filename>")
def css_files(filename):
    return send_from_directory("css", filename)


@app.get("/js/<path:filename>")
def js_files(filename):
    return send_from_directory("js", filename)

PRICE_ID = "price_1UJcVSLqZsJQhgSSB8bPpLL6"  # OfferDesk Founding Dealer $49/mo
FREE_FLIPS_PER_DAY = 3


# ---------- db ----------
def db():
    if USE_PG:
        import psycopg2
        return psycopg2.connect(DATABASE_URL)
    conn = sqlite3.connect(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pro.db"))
    conn.row_factory = sqlite3.Row
    return conn


def q(sql):
    return sql.replace("?", "%s") if USE_PG else sql


def init_db():
    conn = db()
    c = conn.cursor()
    if USE_PG:
        c.execute("""CREATE TABLE IF NOT EXISTS odpro_users(
            id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
            pw_hash TEXT NOT NULL, stripe_customer_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        c.execute("""CREATE TABLE IF NOT EXISTS odpro_flips(
            user_id INT REFERENCES odpro_users(id), day DATE,
            count INT DEFAULT 0, PRIMARY KEY(user_id, day))""")
    else:
        c.execute("""CREATE TABLE IF NOT EXISTS odpro_users(
            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
            pw_hash TEXT NOT NULL, stripe_customer_id TEXT,
            created_at TEXT DEFAULT (datetime('now')))""")
        c.execute("""CREATE TABLE IF NOT EXISTS odpro_flips(
            user_id INT, day TEXT, count INT DEFAULT 0,
            PRIMARY KEY(user_id, day))""")
    conn.commit()
    conn.close()


init_db()


def get_user(email):
    conn = db()
    c = conn.cursor()
    c.execute(q("SELECT id, email, pw_hash, stripe_customer_id FROM odpro_users WHERE email=?"),
              (email.strip().lower(),))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "pw_hash": row[2],
            "stripe_customer_id": row[3]}


def stripe_is_pro(email):
    """True if email has an active/trialing sub containing PRICE_ID. Also returns customer id."""
    if not stripe.api_key:
        return False, None
    try:
        customers = stripe.Customer.list(email=email, limit=1).data
        if not customers:
            return False, None
        cid = customers[0].id
        for status in ("active", "trialing"):
            subs = stripe.Subscription.list(customer=cid, status=status, limit=20).data
            for s in subs:
                items = s.get("items", {}).get("data", []) if isinstance(s.get("items"), dict) else s["items"].data
                for it in items:
                    price = it["price"] if isinstance(it, dict) else it.price
                    pid = price["id"] if isinstance(price, dict) else price.id
                    if pid == PRICE_ID:
                        return True, cid
        return False, cid
    except Exception:
        return False, None


def flips_left(user_id):
    conn = db()
    c = conn.cursor()
    today = date.today().isoformat()
    c.execute(q("SELECT count FROM odpro_flips WHERE user_id=? AND day=?"), (user_id, today))
    row = c.fetchone()
    conn.close()
    used = row[0] if row else 0
    return max(0, FREE_FLIPS_PER_DAY - used)


def record_flip(user_id):
    conn = db()
    c = conn.cursor()
    today = date.today().isoformat()
    if USE_PG:
        c.execute(q("""INSERT INTO odpro_flips(user_id, day, count) VALUES(?,?,1)
            ON CONFLICT(user_id, day) DO UPDATE SET count = odpro_flips.count + 1"""),
                  (user_id, today))
    else:
        c.execute(q("SELECT count FROM odpro_flips WHERE user_id=? AND day=?"), (user_id, today))
        if c.fetchone():
            c.execute(q("UPDATE odpro_flips SET count = count + 1 WHERE user_id=? AND day=?"),
                      (user_id, today))
        else:
            c.execute(q("INSERT INTO odpro_flips(user_id, day, count) VALUES(?,?,1)"),
                      (user_id, today))
    conn.commit()
    conn.close()


# ---------- pages ----------
@app.get("/")
def index():
    return send_from_directory(".", "index.html")


# ---------- api ----------
@app.post("/api/signup")
def signup():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    pw = data.get("password") or ""
    if "@" not in email or len(pw) < 6:
        return jsonify({"ok": False, "error": "Enter a valid email and a 6+ character password."}), 400
    if get_user(email):
        return jsonify({"ok": False, "error": "That email already has an account — log in instead."}), 400
    conn = db()
    c = conn.cursor()
    try:
        c.execute(q("INSERT INTO odpro_users(email, pw_hash) VALUES(?,?)"),
                  (email, generate_password_hash(pw)))
        conn.commit()
    except Exception:
        conn.close()
        return jsonify({"ok": False, "error": "That email is taken."}), 400
    conn.close()
    user = get_user(email)
    pro, cid = stripe_is_pro(email)
    session["uid"] = user["id"]
    session["email"] = email
    return jsonify({"ok": True, "pro": pro, "flips_left": flips_left(user["id"]) if not pro else 999})


@app.post("/api/login")
def login():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    pw = data.get("password") or ""
    user = get_user(email)
    if not user or not check_password_hash(user["pw_hash"], pw):
        return jsonify({"ok": False, "error": "Wrong email or password."}), 401
    pro, cid = stripe_is_pro(email)
    session["uid"] = user["id"]
    session["email"] = email
    return jsonify({"ok": True, "pro": pro, "flips_left": flips_left(user["id"]) if not pro else 999})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    uid = session.get("uid")
    if not uid:
        return jsonify({"email": None, "pro": False, "flips_left": None})
    pro, _ = stripe_is_pro(session.get("email", ""))
    return jsonify({"email": session.get("email"), "pro": pro,
                    "flips_left": flips_left(uid) if not pro else 999})


@app.post("/api/refresh-pro")
def refresh_pro():
    """Call after paying — re-checks Stripe for the subscription."""
    uid = session.get("uid")
    if not uid:
        return jsonify({"ok": False, "error": "Log in first with the email you paid with."}), 401
    pro, _ = stripe_is_pro(session.get("email", ""))
    return jsonify({"ok": True, "pro": pro,
                    "flips_left": flips_left(uid) if not pro else 999})


@app.post("/api/checkout")
def checkout():
    if not stripe.api_key:
        return jsonify({"ok": False, "error": "Payments not configured yet."}), 500
    data = request.get_json(force=True, silent=True) or {}
    email = (session.get("email") or data.get("email") or "").strip().lower()
    if "@" not in email:
        return jsonify({"ok": False, "error": "Enter your email first."}), 400
    try:
        s = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=email,
            line_items=[{"price": PRICE_ID, "quantity": 1}],
            success_url=request.host_url.rstrip("/") + "/?paid=1",
            cancel_url=request.host_url.rstrip("/") + "/",
        )
        return jsonify({"ok": True, "url": s.url})
    except Exception as e:
        return jsonify({"ok": False, "error": "Checkout failed to start."}), 500


@app.post("/api/flip-used")
def flip_used():
    uid = session.get("uid")
    if not uid:
        return jsonify({"ok": False, "error": "login required"}), 401
    pro, _ = stripe_is_pro(session.get("email", ""))
    if pro:
        return jsonify({"ok": True, "pro": True, "flips_left": 999})
    left = flips_left(uid)
    if left <= 0:
        return jsonify({"ok": False, "pro": False, "flips_left": 0})
    record_flip(uid)
    return jsonify({"ok": True, "pro": False, "flips_left": left - 1})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
