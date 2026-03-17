export const metadata = {
  title: "Opt-Out Policy — DealsPro",
  description: "DealsPro opt-out policy explaining how to unsubscribe from RCS/SMS messaging.",
};

export default function OptOutPolicy() {
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
    keyword: { display: "inline-block", background: "#18181B", color: "#FFFFFF", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", padding: "4px 12px", borderRadius: "6px", marginRight: "8px", marginBottom: "4px" },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>Opt-Out Policy</h1>
        <p style={s.subtitle}>Last updated: March 17, 2026</p>
      </div>
      <div style={s.content}>
        <a href="/" style={s.back}>← Back to Home</a>

        <p style={s.p}>
          DealsPro respects your right to control the messages you receive. You may opt out of receiving RCS/SMS messages from us at any time, free of charge. This policy explains all the ways you can unsubscribe and what happens when you do.
        </p>

        <h2 style={s.h2}>1. How to Opt Out via Text</h2>
        <p style={s.p}>
          The easiest way to stop receiving messages is to reply with any of the following keywords to any message you receive from DealsPro:
        </p>
        <div style={{ marginBottom: "16px" }}>
          <span style={s.keyword}>STOP</span>
          <span style={s.keyword}>STOPALL</span>
          <span style={s.keyword}>UNSUBSCRIBE</span>
          <span style={s.keyword}>CANCEL</span>
          <span style={s.keyword}>END</span>
          <span style={s.keyword}>QUIT</span>
        </div>
        <p style={s.p}>
          These keywords are not case-sensitive. Replying <span style={s.strong}>stop</span>, <span style={s.strong}>STOP</span>, or <span style={s.strong}>Stop</span> will all work.
        </p>

        <h2 style={s.h2}>2. What Happens After You Opt Out</h2>
        <p style={s.p}>When you send a STOP keyword:</p>
        <ul style={s.ul}>
          <li style={s.li}>You will receive <span style={s.strong}>one final confirmation message</span> acknowledging your opt-out request. This message will confirm that you have been unsubscribed.</li>
          <li style={s.li}><span style={s.strong}>No further messages</span> will be sent to you, including promotional deals, transactional messages, and service updates.</li>
          <li style={s.li}>Your opt-out is processed <span style={s.strong}>immediately</span>. In rare cases, you may receive a message that was already in the delivery queue, but no new messages will be initiated.</li>
        </ul>

        <h2 style={s.h2}>3. How to Opt Out via Email</h2>
        <p style={s.p}>
          If you are unable to send a text message, you can opt out by emailing us at <span style={s.strong}>support@dealspro.ai</span> with the subject line "Unsubscribe" and including the phone number you wish to unsubscribe. We will process your request within 24 hours.
        </p>

        <h2 style={s.h2}>4. How to Get Help</h2>
        <p style={s.p}>
          If you need assistance with your messaging preferences or have questions about your subscription, you can:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Reply <span style={s.strong}>HELP</span> to any DealsPro message to receive support information</li>
          <li style={s.li}>Email us at support@dealspro.ai</li>
          <li style={s.li}>Visit dealspro.ai for more information</li>
        </ul>

        <h2 style={s.h2}>5. Re-Subscribing After Opt-Out</h2>
        <p style={s.p}>
          If you opt out and later wish to receive messages again, you can re-subscribe at any time by:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Visiting dealspro.ai and completing the sign-up form with your phone number</li>
          <li style={s.li}>Replying <span style={s.strong}>START</span> or <span style={s.strong}>UNSTOP</span> to our phone number</li>
        </ul>
        <p style={s.p}>
          Upon re-subscribing, you will receive a new welcome message confirming your subscription.
        </p>

        <h2 style={s.h2}>6. Impact on Existing Purchases</h2>
        <p style={s.p}>
          Opting out of messages does <span style={s.strong}>not</span> affect any deals you have already purchased. Your QR codes and purchased deals remain valid until their expiration date. However, you will not receive any message reminders about expiring deals after opting out.
        </p>

        <h2 style={s.h2}>7. Data Retention After Opt-Out</h2>
        <p style={s.p}>
          When you opt out, we retain a record of your opt-out preference to ensure we honor your request and do not send you messages in the future. If you wish to have your personal data deleted entirely, please contact us at support@dealspro.ai with a deletion request.
        </p>

        <h2 style={s.h2}>8. No Fees for Opting Out</h2>
        <p style={s.p}>
          There is no charge from DealsPro to opt out of messaging. Standard carrier message and data rates may apply when sending a STOP keyword, as determined by your mobile carrier and plan.
        </p>

        <h2 style={s.h2}>9. Contact Us</h2>
        <p style={s.p}>
          If you have questions about opting out or need assistance, contact us at:
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
