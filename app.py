import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, date
import os
import tempfile

from database import get_engine, get_session, init_db, Transaction, UploadedFile, User, CATEGORY_MAPPING, get_password_hash, verify_password
from parser import ingest_pdf
from locales import translate

# Initialize DB on start
engine = get_engine()
init_db(engine)

# ==========================================
# UI CONFIG
# ==========================================
st.set_page_config(
    page_title="Accountant Hub",
    page_icon="💼",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
<style>
    .stApp { background-color: #0f172a; color: #f8fafc; }
    .stMetric { background-color: #1e293b; padding: 15px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .css-1d391kg { background-color: #1e293b; }
    h1, h2, h3 { color: #38bdf8; }
    .stButton>button { background-color: #0ea5e9; color: white; border-radius: 6px; border: none; padding: 0.5rem 1rem; transition: all 0.3s ease; }
    .stButton>button:hover { background-color: #0284c7; transform: translateY(-2px); }
    
    /* Responsive Tweaks */
    @media (max-width: 768px) {
        .stMetric { padding: 10px; }
        h1 { font-size: 1.8rem !important; }
        h3 { font-size: 1.2rem !important; }
        [data-testid="stSidebar"] { min-width: 250px !important; }
    }
</style>
""", unsafe_allow_html=True)

# ==========================================
# SESSION & AUTHENTICATION
# ==========================================
if 'user_id' not in st.session_state:
    st.session_state['user_id'] = None
if 'role' not in st.session_state:
    st.session_state['role'] = None
if 'lang' not in st.session_state:
    st.session_state['lang'] = 'en'
    
def t(key):
    return translate(key, st.session_state['lang'])

def login(username, password):
    session = get_session(engine)
    user = session.query(User).filter_by(username=username).first()
    if user and verify_password(password, user.password_hash):
        st.session_state['user_id'] = user.id
        st.session_state['role'] = user.role
        st.session_state['lang'] = user.language_preference
        session.close()
        return True
    session.close()
    return False

def signup(username, password, lang="en", role="User"):
    session = get_session(engine)
    if session.query(User).filter_by(username=username).first():
        session.close()
        return False # existing
    
    new_user = User(
        username=username,
        password_hash=get_password_hash(password),
        role=role,
        language_preference=lang
    )
    session.add(new_user)
    session.commit()
    session.close()
    return True

def logout():
    st.session_state['user_id'] = None
    st.session_state['role'] = None

if not st.session_state['user_id']:
    st.title("Accountant Hub")
    tab_login, tab_signup = st.tabs([t("login"), t("signup")])
    
    with tab_login:
        with st.form("login_form"):
            user_in = st.text_input(t("username"))
            pass_in = st.text_input(t("password"), type="password")
            if st.form_submit_button(t("login")):
                if login(user_in, pass_in):
                    st.rerun()
                else:
                    st.error("Invalid credentials")
                    
    with tab_signup:
        with st.form("signup_form"):
            new_user = st.text_input(t("username"))
            new_pass = st.text_input(t("password"), type="password")
            confirm_pass = st.text_input(t("confirm_password"), type="password")
            
            c_lang, c_role = st.columns(2)
            with c_lang:
                pref_lang = st.selectbox(t("language"), ["en", "es", "de"])
            with c_role:
                pref_role = st.selectbox(t("role"), ["User", "Admin"])
                
            if st.form_submit_button(t("signup")):
                if new_pass != confirm_pass:
                    st.error("Passwords do not match.")
                elif len(new_pass) < 6: # Basic validation
                    st.error("Password must be at least 6 characters.")
                elif signup(new_user, new_pass, pref_lang, pref_role):
                    st.success("Account created! Please login.")
                else:
                    st.error("Username already exists.")
                    
    st.stop() # Halt execution if not logged in

# ==========================================
# AUTHENTICATED AREA
# ==========================================

# Custom Header Image
header_img_path = os.path.join(os.path.dirname(__file__), "Media", "AccountHub_cabecera.png")
if os.path.exists(header_img_path):
    st.image(header_img_path, use_column_width=True)

# Top Bar / Setup
col_title, col_lang, col_logout = st.columns([6, 2, 1])
with col_title:
    if not os.path.exists(header_img_path):
        st.title(t("app_title"))
with col_lang:
    new_lang = st.selectbox("", ["en", "es", "de"], index=["en", "es", "de"].index(st.session_state['lang']), key="lang_selector", label_visibility="collapsed")
    if new_lang != st.session_state['lang']:
        st.session_state['lang'] = new_lang
        # optionally update DB too
        session = get_session(engine)
        user = session.query(User).get(st.session_state['user_id'])
        if user:
            user.language_preference = new_lang
            session.commit()
        session.close()
        st.rerun()
with col_logout:
    if st.button(t("logout")):
        logout()
        st.rerun()

# ==========================================
# DATA FETCHING & FILTERING
# ==========================================
@st.cache_data(ttl=5)
def load_data(user_id, role):
    session = get_session(engine)
    try:
        query = session.query(Transaction)
        if role != "Admin":
            query = query.filter(Transaction.user_id == user_id)
        df = pd.read_sql(query.statement, session.bind)
        if not df.empty:
            df['date'] = pd.to_datetime(df['date'])
        return df
    finally:
        session.close()

df = load_data(st.session_state['user_id'], st.session_state['role'])

session = get_session(engine)
current_user = session.query(User).get(st.session_state['user_id'])
display_name = current_user.username.capitalize() if current_user else "User"
session.close()

# Custom Sidebar Profile Widget
st.sidebar.markdown(f"""
<div style="display: flex; align-items: center; padding: 15px; background-color: rgba(30, 41, 59, 0.7); border-radius: 12px; margin-bottom: 25px; border-left: 4px solid #0ea5e9;">
    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed={display_name}&backgroundColor=transparent" width="55" style="border-radius: 50%; border: 2px solid #38bdf8; margin-right: 15px;">
    <div>
        <h3 style="margin:0; padding:0; font-size: 1.2rem; color: #f8fafc; font-weight: 600;">{display_name}</h3>
        <p style="margin:0; padding:0; font-size: 0.85rem; color: #38bdf8; font-weight: 500;">{st.session_state['role']} {t("role")}</p>
    </div>
</div>
""", unsafe_allow_html=True)

if st.session_state['role'] == "Admin":
    st.sidebar.caption("Admin Mode: Global Access")
    # Custom Admin Background Image feature
    admin_banner_path = os.path.join(os.path.dirname(__file__), "Media", "TBF_Bannerbase_032026.gif")
    if os.path.exists(admin_banner_path):
        import base64
        with open(admin_banner_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode()
        st.markdown(
            f"""
            <style>
            [data-testid="stSidebar"] {{
                background-image: linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url("data:image/png;base64,{encoded_string}");
                background-size: cover;
                background-position: center;
            }}
            </style>
            """,
            unsafe_allow_html=True
        )
st.sidebar.markdown("---")

if not df.empty:
    default_start = df['date'].min().date()
    default_end = df['date'].max().date()
else:
    default_start = date(2025, 1, 1)
    default_end = date.today()

# Provide broader fallback dates so users can freely select
date_range = st.sidebar.date_input(
    t("date_range"), 
    value=(default_start, default_end)
)

account_sources = ["All"] + (df['account_source'].unique().tolist() if not df.empty else ["PostFinance", "CornerCard", "Manual"])
selected_account = st.sidebar.selectbox(t("account_source"), account_sources)

filtered_df = df.copy()
if not filtered_df.empty:
    if isinstance(date_range, (list, tuple)) and len(date_range) == 2:
        start_date, end_date = date_range
        filtered_df = filtered_df[(filtered_df['date'].dt.date >= start_date) & (filtered_df['date'].dt.date <= end_date)]
    
    if selected_account != "All":
        filtered_df = filtered_df[filtered_df['account_source'] == selected_account]

# ==========================================
# TABS
# ==========================================
tabs = [t("dashboard"), t("upload_pdf"), t("manual_entry"), t("file_manager")]
selected_tab = st.tabs(tabs)

# --- DASHBOARD ---
with selected_tab[0]:
    if filtered_df.empty:
        st.info(t("no_data"))
    else:
        col1, col2, col3 = st.columns(3)
        total_income = filtered_df[filtered_df['amount'] > 0]['amount'].sum()
        total_expenses = filtered_df[filtered_df['amount'] < 0]['amount'].sum()
        balance = total_income + total_expenses

        col1.metric(t("total_income"), f"CHF {total_income:,.2f}")
        col2.metric(t("total_expenses"), f"CHF {abs(total_expenses):,.2f}")
        col3.metric(t("net_balance"), f"CHF {balance:,.2f}")

        st.markdown("---")
        c1, c2 = st.columns(2)

        with c1:
            st.subheader(t("expenses_by_category"))
            expenses_df = filtered_df[filtered_df['amount'] < 0]
            if not expenses_df.empty:
                cat_expenses = expenses_df.groupby('category')['amount'].sum().abs().reset_index()
                fig = px.pie(cat_expenses, values='amount', names='category', hole=0.4, 
                             color_discrete_sequence=px.colors.sequential.RdBu)
                st.plotly_chart(fig, use_container_width=True)

        with c2:
            st.subheader(t("cash_flow"))
            # Optionally group by month if dates span more than 60 days
            days_span = (filtered_df['date'].max() - filtered_df['date'].min()).days
            
            if days_span > 60:
                filtered_df['Month'] = filtered_df['date'].dt.to_period('M').astype(str)
                flow_data = filtered_df.groupby('Month')['amount'].sum().reset_index()
                x_axis = 'Month'
            else:
                flow_data = filtered_df.groupby('date')['amount'].sum().reset_index()
                x_axis = 'date'
                
            fig2 = px.bar(flow_data, x=x_axis, y='amount', 
                          color='amount', color_continuous_scale=['red', 'green'])
            st.plotly_chart(fig2, use_container_width=True)

        st.subheader(t("recent_transactions"))
        display_df = filtered_df.sort_values(by='date', ascending=False)
        
        if st.session_state['lang'] == 'de':
            display_df['date'] = display_df['date'].dt.strftime('%d.%m.%Y')
        elif st.session_state['lang'] == 'es':
            display_df['date'] = display_df['date'].dt.strftime('%d/%m/%Y')
        else:
            display_df['date'] = display_df['date'].dt.strftime('%Y-%m-%d')
            
        st.dataframe(
            display_df[['date', 'merchant', 'city', 'category', 'amount', 'account_source']], 
            use_container_width=True, 
            hide_index=True,
            column_config={
                "amount": st.column_config.NumberColumn(t("amount"), format="CHF %.2f")
            }
        )

# --- UPLOAD PDF ---
with selected_tab[1]:
    col_acc, col_up = st.columns([1, 2])
    with col_acc:
        upload_source = st.selectbox(t("select_bank_format"), ["PostFinance", "CornerCard"])
    with col_up:
        uploaded_file = st.file_uploader(t("drag_drop"), type=["pdf"])
    
    if uploaded_file is not None:
        if st.button(t("process_pdf")):
            with st.spinner("Processing..."):
                try:
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
                        tmp.write(uploaded_file.getvalue())
                        tmp_path = tmp.name
                    
                    added_count = ingest_pdf(tmp_path, upload_source, uploaded_file.name, st.session_state['user_id'])
                    st.success(f"{t('success')}: {added_count} records")
                    os.unlink(tmp_path)
                    load_data.clear()
                    st.rerun()
                except Exception as e:
                    st.error(f"{t('error')}: {e}")

# --- MANUAL ENTRY ---
with selected_tab[2]:
    with st.form("manual_entry_form", clear_on_submit=True):
        col_m1, col_m2, col_m3 = st.columns(3)
        with col_m1:
            m_date = st.date_input("Date", date.today())
            m_amount = st.number_input(t("amount"), value=0.0)
        with col_m2:
            m_merchant = st.text_input(t("merchant"))
            m_city = st.text_input(t("city"))
        with col_m3:
            categories = list(set(CATEGORY_MAPPING.values())) + ["Uncategorized", "Salary", "Other"]
            m_category = st.selectbox(t("category"), sorted(categories))
            
        m_notes = st.text_area(t("notes"))
        
        if st.form_submit_button(t("add_transaction")):
            if m_amount != 0.0 and m_merchant:
                session = get_session(engine)
                try:
                    tx_type = "Income" if m_amount > 0 else "Expense"
                    tx = Transaction(
                        date=m_date,
                        amount=m_amount,
                        type=tx_type,
                        merchant=m_merchant,
                        city=m_city,
                        category=m_category,
                        account_source="Manual",
                        long_reference_metadata=m_notes,
                        user_id=st.session_state['user_id']
                    )
                    session.add(tx)
                    session.commit()
                    st.success(t("success"))
                    load_data.clear()
                    st.rerun()
                except Exception as e:
                    session.rollback()
                    st.error(f"{t('error')}: {e}")
                finally:
                    session.close()

# --- FILE MANAGER ---
with selected_tab[3]:
    st.subheader(t("file_manager"))
    if st.session_state['role'] == "Admin":
        st.info("Admin Mode: Viewing all uploaded files across the system.")
    
    session = get_session(engine)
    query = session.query(UploadedFile)
    
    if st.session_state['role'] != "Admin":
        query = query.filter(UploadedFile.uploaded_by == st.session_state['user_id'])
        
    files = query.all()
    
    if not files:
        st.info("No files uploaded yet.")
    else:
        for f in files:
            with st.expander(f"{f.filename} ({f.account_source}) - {f.upload_date.strftime('%Y-%m-%d %H:%M')}"):
                st.write(f"Size: {(f.file_size or 0) / 1024:.1f} KB")
                if st.session_state['role'] == "Admin":
                    st.write(f"Uploaded By: User ID {f.uploaded_by}")
                
                if st.button(t("delete"), key=f"del_{f.id}"):
                    try:
                        file_to_del = session.query(UploadedFile).get(f.id)
                        session.delete(file_to_del)
                        session.commit()
                        st.success(t("file_deleted"))
                        load_data.clear()
                        st.rerun()
                    except Exception as e:
                        session.rollback()
                        st.error(f"{t('error')}: {e}")
    session.close()
