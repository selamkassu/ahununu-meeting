# Ahununu Meeting Portal — Render Email Deployment & Troubleshooting Guide

## 1. Why Did Notification Emails Fail on Render (While Working on Localhost)?

When running on **localhost / development**, your computer connects directly to Gmail's SMTP servers (`smtp.gmail.com` on port 465 or 587) through your local ISP.

However, **Render's platform policy explicitly blocks outbound network traffic on SMTP ports 25, 465, and 587 for all Free Tier services**:
> *"Render blocks outbound network traffic on SMTP ports 25, 465, and 587 for all Free tier web services to prevent abuse and protect IP reputation."*

### What Happened in Your Code:
1. `nodemailer.createTransport({ service: "gmail" })` attempts a TCP connection to `smtp.gmail.com:465`.
2. On Render Free Tier, Render's firewall silently drops the outgoing packets (*blackholing*).
3. The server hangs waiting for a TCP handshake response until connection timeout (`ETIMEDOUT`).
4. In sequential loops, sending invites to multiple meeting participants multiplied the timeout delay, causing requests to stall or fail.
5. In addition, `.env` is gitignored by default, meaning credentials like `GMAIL_USER` and `APP_URL` are not automatically present on Render unless added in the Render Dashboard.

---

## 2. What We Fixed in the Codebase

We upgraded the portal's email engine to be **Universal & Cloud-Ready**:

1. **Multi-Provider HTTP API Support (Port 443 — 100% Safe for Render)**:
   - Added native support for **Resend HTTP API** (`RESEND_API_KEY`) and **Brevo / Sendinblue HTTP API** (`BREVO_API_KEY`).
   - Because HTTP APIs communicate over **HTTPS (Port 443)**, they are **NEVER blocked by Render**, guaranteeing immediate, reliable delivery.
2. **Alternative Port SMTP Support (Port 2525)**:
   - Added support for custom SMTP relay hosts on port `2525`, which is typically unblocked on Render.
3. **Fail-Fast Timeouts for Nodemailer**:
   - Added strict connection timeouts (`connectionTimeout: 8000ms`, `greetingTimeout: 8000ms`, `socketTimeout: 10000ms`). The server will never hang indefinitely.
4. **Concurrent Email Dispatch (`Promise.allSettled`)**:
   - Meeting invitations, cancellations, and action item emails now dispatch in parallel, ensuring fast responses even for large attendee lists.
5. **Live Diagnostics & Test Endpoint (`/api/notifications/test-email`)**:
   - An authenticated endpoint where you or the system admin can test live email delivery with detailed error reporting.
6. **Enhanced Settings Page UI (`SettingsPage.tsx`)**:
   - Added a **Live Email & Notification Delivery Service** card to the Settings page.
   - Shows active provider status, sender address, cloud safety badge, and an interactive **"Send Test Notification"** form right in the browser!
7. **Dynamic `APP_URL` Resolution**:
   - Automatically adapts to `APP_URL`, `FRONTEND_URL`, or `RENDER_EXTERNAL_URL` so email links (RSVP accept/decline) point to your live deployed site instead of `localhost`.

---

## 3. How to Configure Render (Recommended Solutions)

To make email notifications work on Render, choose either **Option A** (Recommended) or **Option B**:

---

### Option A: Resend (Recommended — 2 Minutes Setup)
Resend is built specifically for modern cloud hosting like Render and Vercel.
- **Cost**: 100% Free (3,000 emails/month, 100 emails/day).
- **Protocol**: HTTPS REST API (Port 443 — zero blocked ports).

#### Step-by-Step:
1. Sign up for free at [https://resend.com](https://resend.com).
2. Go to **API Keys** and click **Create API Key**. Copy your key (starts with `re_...`).
3. Open your **Render Dashboard** → Select your **Backend Web Service** → Click **Environment**.
4. Add the following environment variables:
   ```env
   RESEND_API_KEY=re_your_api_key_here
   EMAIL_FROM=Ahununu Meeting Portal <onboarding@resend.dev>
   APP_URL=https://your-frontend-app.onrender.com
   ```
   *(Note: You can use `onboarding@resend.dev` immediately for testing without owning a custom domain, or add and verify your own custom domain in Resend).*
5. Click **Save Changes**. Render will automatically redeploy with email delivery fully active!

---

### Option B: Brevo / Sendinblue (Free 300 Emails / Day Forever)
Brevo allows sending from your personal Gmail address (`Selamkassu7@gmail.com`) via their HTTP API!
- **Cost**: 100% Free (300 emails/day forever).
- **Protocol**: HTTPS REST API (Port 443 — zero blocked ports).

#### Step-by-Step:
1. Sign up for free at [https://brevo.com](https://brevo.com).
2. Go to your Account Menu (top right) → **SMTP & API** → **API Keys** → **Generate a new API key**.
3. Go to **Senders & IP** in Brevo and verify your sender email (e.g. `Selamkassu7@gmail.com`).
4. In your **Render Dashboard** → Backend Web Service → **Environment**, add:
   ```env
   BREVO_API_KEY=xkeysib-your_brevo_api_key_here
   BREVO_SENDER_EMAIL=Selamkassu7@gmail.com
   APP_URL=https://your-frontend-app.onrender.com
   ```
5. Click **Save Changes**.

---

### Option C: If You Upgrade to a Paid Render Instance ($7/mo)
On Render paid instance types, outbound ports 465 and 587 are unblocked.
If you are on a paid instance, your existing Gmail credentials will work:
```env
GMAIL_USER=Selamkassu7@gmail.com
GMAIL_APP_PASSWORD=bcsh vkti kktg hghk
APP_URL=https://your-frontend-app.onrender.com
```

---

## 4. How to Verify Your Setup

Once deployed:
1. Log in to the Ahununu Meeting Portal as an Admin.
2. Navigate to **Settings** in the sidebar.
3. Check the **Email & Notification Delivery Service** card:
   - It will display a green **Ready (Cloud-Safe)** badge.
   - It will show your active provider (`Resend (HTTP API, Port 443)` or `Brevo (HTTP API, Port 443)`).
4. In the **Test Live Email Dispatch** box, enter your email address and click **Send Test Notification**.
5. You will see an instant **Delivery Confirmed** checkmark and receive the branded test email in your inbox!
