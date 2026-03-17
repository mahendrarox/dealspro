export const metadata = {
  title: "Opt-In Policy — DealsPro",
  description: "DealsPro opt-in policy explaining how we collect consent for RCS/SMS messaging.",
};

export default function OptInPolicy() {
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
    box: { background: "#F7F7F8", border: "1px solid #E4E4E7", borderRadius: "12px", padding: "24px", marginBottom: "24px" },
    boxTitle: { fontFamily: "'DM Sans', sans-serif", fontSize: "16px", fontWeight: 700, color: "#18181B", marginBottom: "8px" },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>Opt-In Policy</h1>
        <p style={s.subtitle}>Last updated: March 17, 2026</p>
      </div>
      <div style={s.content}>
        <a href="/" style={s.back}>← Back to Home</a>

        <p style={s.p}>
          DealsPro ("we," "us," or "our") is committed to responsible messaging practices. This Opt-In Policy explains how we obtain, record, and manage your consent to receive RCS and SMS messages from DealsPro.
        </p>

        <h2 style={s.h2}>1. How We Collect Consent</h2>
        <p style={s.p}>
          We collect your express written consent to receive messages through the following methods:
        </p>
        <ul style={s.ul}>
          <li style={s.li}><span style={s.strong}>Website Sign-Up Form:</span> When you enter your name and phone number on dealspro.ai and check the opt-in checkbox that states: <em>"I agree to receive exclusive deal alerts and promotions via RCS/SMS. Message & data rates may apply. Reply STOP to unsubscribe anytime."</em></li>
          <li style={s.li}><span style={s.strong}>QR Code Scan:</span> When you scan a DealsPro QR code at a participating restaurant and complete the opt-in form.</li>
          <li style={s.li}><span style={s.strong}>Creator/Influencer Referral:</span> When you opt in through a creator's branded DealsPro page and complete the consent form.</li>
        </ul>
        <p style={s.p}>
          In all cases, you must actively check the consent checkbox and submit the form. Consent is never pre-checked or assumed.
        </p>

        <h2 style={s.h2}>2. What You Are Consenting To</h2>
        <p style={s.p}>By opting in, you agree to receive:</p>
        <ul style={s.ul}>
          <li style={s.li}><span style={s.strong}>Promotional Messages:</span> Weekly deal alerts featuring exclusive, limited-time restaurant deals in your area.</li>
          <li style={s.li}><span style={s.strong}>Transactional Messages:</span> Order confirmations, QR codes for deal redemption, and purchase receipts.</li>
          <li style={s.li}><span style={s.strong}>Service Messages:</span> Welcome messages, account updates, and responses to your inquiries.</li>
        </ul>

        <h2 style={s.h2}>3. Message Frequency</h2>
        <p style={s.p}>
          Message frequency varies based on deal availability. You can expect to receive approximately <span style={s.strong}>1 to 4 promotional messages per week</span>, plus any transactional messages related to deals you purchase. We will never send excessive or unnecessary messages.
        </p>

        <h2 style={s.h2}>4. Message and Data Rates</h2>
        <p style={s.p}>
          <span style={s.strong}>Standard message and data rates may apply.</span> DealsPro does not charge you for messages we send. However, your mobile carrier may charge standard messaging and data fees according to your plan. Contact your carrier for details about your plan.
        </p>

        <h2 style={s.h2}>5. Consent Is Voluntary</h2>
        <p style={s.p}>
          Your consent to receive RCS/SMS messages is completely voluntary. <span style={s.strong}>Consent is not a condition of purchasing any deal, using our website, or receiving any other service from DealsPro.</span> You may browse deals and use our website without opting in to messaging.
        </p>

        <h2 style={s.h2}>6. How We Record Consent</h2>
        <p style={s.p}>We maintain a record of your consent that includes:</p>
        <ul style={s.ul}>
          <li style={s.li}>The phone number you provided</li>
          <li style={s.li}>The date and time you opted in</li>
          <li style={s.li}>The method of opt-in (website form, QR code, or creator referral)</li>
          <li style={s.li}>The exact consent language displayed at the time of opt-in</li>
          <li style={s.li}>Your IP address at the time of consent</li>
        </ul>
        <p style={s.p}>
          These records are retained securely and are available for compliance verification as required by the CTIA, TCPA, and carrier guidelines.
        </p>

        <h2 style={s.h2}>7. Sharing of Consent Data</h2>
        <div style={s.box}>
          <p style={{ ...s.p, marginBottom: 0 }}>
            <span style={s.strong}>We do not sell, rent, lease, or share your text messaging opt-in consent data, phone number, or any related personal information with any third parties for their marketing or promotional purposes.</span> This applies to all data collected through our messaging opt-in process.
          </p>
        </div>
        <p style={s.p}>
          Your consent data is shared only with our messaging service provider (Twilio) solely for the purpose of delivering messages you have consented to receive.
        </p>

        <h2 style={s.h2}>8. How to Opt Out</h2>
        <p style={s.p}>
          You can revoke your consent and stop receiving messages at any time. See our <a href="/opt-out" style={{ color: "#F93A25", fontWeight: 600, textDecoration: "none" }}>Opt-Out Policy</a> for full details on how to unsubscribe.
        </p>

        <h2 style={s.h2}>9. Welcome Message</h2>
        <p style={s.p}>
          After you opt in, you will receive a welcome message confirming your subscription. This message will include:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Confirmation that you have been subscribed to DealsPro deal alerts</li>
          <li style={s.li}>The expected message frequency</li>
          <li style={s.li}>Instructions on how to opt out (reply STOP)</li>
          <li style={s.li}>Instructions on how to get help (reply HELP)</li>
          <li style={s.li}>A link to our Privacy Policy</li>
        </ul>

        <h2 style={s.h2}>10. Contact Us</h2>
        <p style={s.p}>
          If you have questions about our opt-in practices or need assistance, contact us at:
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
