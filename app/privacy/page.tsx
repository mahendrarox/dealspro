export const metadata = {
  title: "Privacy Policy — DealsPro",
  description: "DealsPro privacy policy covering data collection, RCS/SMS messaging, and your rights.",
};

export default function PrivacyPolicy() {
  const s = {
    page: { fontFamily: "'DM Sans', sans-serif", color: "#18181B", background: "#FFFFFF", minHeight: "100vh" },
    header: { background: "#111114", padding: "100px 20px 48px", textAlign: "center" as const },
    h1: { fontFamily: "'DM Sans', sans-serif", fontSize: "36px", fontWeight: 800, color: "#fff", marginBottom: "8px" },
    subtitle: { fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "#A1A1AA" },
    content: { maxWidth: "720px", margin: "0 auto", padding: "48px 20px 80px" },
    h2: { fontFamily: "'DM Sans', sans-serif", fontSize: "22px", fontWeight: 700, color: "#18181B", marginTop: "40px", marginBottom: "12px" },
    p: { fontFamily: "'DM Sans', sans-serif", fontSize: "15px", lineHeight: 1.8, color: "#52525B", marginBottom: "16px" },
    ul: { fontFamily: "'DM Sans', sans-serif", fontSize: "15px", lineHeight: 1.8, color: "#52525B", marginBottom: "16px", paddingLeft: "24px" },
    li: { marginBottom: "8px" },
    strong: { color: "#18181B", fontWeight: 600 },
    back: { display: "inline-block", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 600, color: "#F93A25", textDecoration: "none", marginBottom: "32px" },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.subtitle}>Last updated: March 15, 2026</p>
      </div>
      <div style={s.content}>
        <a href="/" style={s.back}>← Back to Home</a>

        <p style={s.p}>
          DealsPro ("we," "us," or "our") operates the website dealspro.ai and related services. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services, including our RCS and SMS messaging programs.
        </p>

        <h2 style={s.h2}>1. Information We Collect</h2>
        <p style={s.p}>We collect the following personal information when you sign up for DealsPro:</p>
        <ul style={s.ul}>
          <li style={s.li}><span style={s.strong}>Name:</span> Your first name, used to personalize your deal alerts.</li>
          <li style={s.li}><span style={s.strong}>Phone Number:</span> Your mobile phone number, used to deliver deal alerts via RCS or SMS messaging.</li>
          <li style={s.li}><span style={s.strong}>Opt-in Consent:</span> A record of your consent to receive messages, including the timestamp and method of consent.</li>
        </ul>
        <p style={s.p}>We may also automatically collect device information, IP address, browser type, and usage data when you interact with our website.</p>

        <h2 style={s.h2}>2. How We Use Your Information</h2>
        <p style={s.p}>We use your personal information for the following purposes:</p>
        <ul style={s.ul}>
          <li style={s.li}>To send you exclusive restaurant deal alerts via RCS and/or SMS messaging</li>
          <li style={s.li}>To personalize your deal recommendations</li>
          <li style={s.li}>To process transactions when you purchase a deal</li>
          <li style={s.li}>To send transactional messages (order confirmations, QR codes for redemption)</li>
          <li style={s.li}>To communicate with you about your account and our services</li>
          <li style={s.li}>To improve our website and services</li>
        </ul>

        <h2 style={s.h2}>3. RCS/SMS Messaging Program</h2>
        <p style={s.p}>
          By providing your phone number and checking the opt-in checkbox on our website, you expressly consent to receive recurring automated promotional and transactional messages from DealsPro via RCS and/or SMS to the phone number you provided. Message frequency varies based on deal availability, typically 1-4 messages per week.
        </p>
        <p style={s.p}>
          <span style={s.strong}>Message and data rates may apply.</span> Your carrier's standard messaging and data rates may apply to messages you receive from us. DealsPro does not charge for messages, but your mobile carrier may.
        </p>
        <p style={s.p}>
          <span style={s.strong}>Opt-out:</span> You may opt out of receiving messages at any time by replying <span style={s.strong}>STOP</span> to any message you receive from us. After opting out, you will receive a single confirmation message and will no longer receive messages from us unless you re-subscribe.
        </p>
        <p style={s.p}>
          <span style={s.strong}>Help:</span> For help, reply <span style={s.strong}>HELP</span> to any message or contact us at support@dealspro.ai.
        </p>

        <h2 style={s.h2}>4. Sharing of Phone Numbers and Personal Data</h2>
        <p style={s.p}>
          <span style={s.strong}>We do not sell, rent, or share your mobile phone number or any personal information with third parties for their marketing or promotional purposes.</span>
        </p>
        <p style={s.p}>We may share your information only in the following limited circumstances:</p>
        <ul style={s.ul}>
          <li style={s.li}><span style={s.strong}>Service Providers:</span> We share data with trusted service providers who assist in operating our platform (e.g., Twilio for message delivery, Stripe for payment processing, Supabase for data storage). These providers are contractually obligated to protect your data.</li>
          <li style={s.li}><span style={s.strong}>Partner Restaurants:</span> When you purchase a deal, we share your first name with the participating restaurant solely for the purpose of redeeming your deal. We do not share your phone number with restaurants.</li>
          <li style={s.li}><span style={s.strong}>Legal Requirements:</span> We may disclose information if required by law, regulation, or legal process.</li>
        </ul>
        <p style={s.p}>
          <span style={s.strong}>We do not share text messaging opt-in consent data or phone numbers with any third parties for their own marketing purposes.</span>
        </p>

        <h2 style={s.h2}>5. Data Security</h2>
        <p style={s.p}>
          We implement industry-standard security measures to protect your personal information, including encryption of data in transit and at rest, secure access controls, and regular security assessments. However, no method of electronic storage or transmission is 100% secure.
        </p>

        <h2 style={s.h2}>6. Data Retention</h2>
        <p style={s.p}>
          We retain your personal information for as long as your account is active or as needed to provide you services. If you opt out of messaging, we will retain a record of your opt-out preference to ensure we honor your request. You may request deletion of your data by contacting us at support@dealspro.ai.
        </p>

        <h2 style={s.h2}>7. Your Rights</h2>
        <p style={s.p}>Depending on your location, you may have the following rights:</p>
        <ul style={s.ul}>
          <li style={s.li}>The right to access the personal information we hold about you</li>
          <li style={s.li}>The right to request correction of inaccurate data</li>
          <li style={s.li}>The right to request deletion of your personal information</li>
          <li style={s.li}>The right to opt out of promotional communications at any time</li>
        </ul>
        <p style={s.p}>To exercise any of these rights, contact us at support@dealspro.ai.</p>

        <h2 style={s.h2}>8. Children's Privacy</h2>
        <p style={s.p}>
          DealsPro is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child under 18, we will delete it promptly.
        </p>

        <h2 style={s.h2}>9. Changes to This Policy</h2>
        <p style={s.p}>
          We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page with a revised "Last updated" date. Your continued use of our services after changes are posted constitutes acceptance of the updated policy.
        </p>

        <h2 style={s.h2}>10. Contact Us</h2>
        <p style={s.p}>
          If you have questions about this Privacy Policy or our data practices, contact us at:
        </p>
        <p style={s.p}>
          DealsPro<br />
          Email: support@dealspro.ai<br />
          Website: dealspro.ai
        </p>
      </div>
    </div>
  );
}
