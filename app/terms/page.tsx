export const metadata = {
  title: "Terms of Service — DealsPro",
  description: "DealsPro terms of service covering messaging, deals, payments, and usage.",
};

export default function TermsOfService() {
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
        <h1 style={s.h1}>Terms of Service</h1>
        <p style={s.subtitle}>Last updated: March 15, 2026</p>
      </div>
      <div style={s.content}>
        <a href="/" style={s.back}>← Back to Home</a>

        <p style={s.p}>
          Welcome to DealsPro. By accessing or using our website (dealspro.ai) and services, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our services.
        </p>

        <h2 style={s.h2}>1. Overview of Services</h2>
        <p style={s.p}>
          DealsPro is a platform that connects consumers with exclusive, limited-time restaurant deals. We deliver deal alerts to subscribers via RCS (Rich Communication Services) and/or SMS messaging. Deals are limited in quantity (typically 20 per restaurant per week) and are available on a first-come, first-served basis.
        </p>

        <h2 style={s.h2}>2. Eligibility</h2>
        <p style={s.p}>
          You must be at least 18 years old and a resident of the United States to use DealsPro. By signing up, you represent that you meet these requirements and that the information you provide is accurate and complete.
        </p>

        <h2 style={s.h2}>3. Account and Registration</h2>
        <p style={s.p}>
          To receive deal alerts, you must provide your name and a valid US mobile phone number and consent to receive RCS/SMS messages. You are responsible for maintaining the accuracy of your information. You may only register one account per phone number.
        </p>

        <h2 style={s.h2}>4. Messaging Terms</h2>
        <p style={s.p}>
          By opting in to DealsPro messaging, you agree to the following:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>You consent to receive recurring automated promotional and transactional messages from DealsPro via RCS and/or SMS.</li>
          <li style={s.li}>Message frequency varies. You may receive approximately 1-4 messages per week, with additional transactional messages related to deals you purchase.</li>
          <li style={s.li}><span style={s.strong}>Message and data rates may apply.</span> Standard carrier messaging and data rates may apply. DealsPro does not charge for messages sent to you.</li>
          <li style={s.li}>You may opt out at any time by replying <span style={s.strong}>STOP</span> to any message. You will receive a confirmation and no further messages.</li>
          <li style={s.li}>For help, reply <span style={s.strong}>HELP</span> or contact support@dealspro.ai.</li>
          <li style={s.li}>Consent to receive messages is not a condition of purchasing any deal or using our website.</li>
        </ul>

        <h2 style={s.h2}>5. Deals and Purchases</h2>
        <p style={s.p}>
          Deals available through DealsPro are subject to the following conditions:
        </p>
        <ul style={s.ul}>
          <li style={s.li}><span style={s.strong}>Limited Quantity:</span> Deals are limited in number and available on a first-come, first-served basis. Availability is not guaranteed.</li>
          <li style={s.li}><span style={s.strong}>Prepayment:</span> Deals require prepayment at the time of purchase. Payment is processed securely through our payment processor (Stripe).</li>
          <li style={s.li}><span style={s.strong}>Redemption:</span> After purchase, you will receive a QR code via message. Present this QR code at the participating restaurant to redeem your deal.</li>
          <li style={s.li}><span style={s.strong}>Expiration:</span> Deals have expiration dates clearly stated at the time of purchase. Unredeemed deals expire and are non-refundable after the expiration date.</li>
          <li style={s.li}><span style={s.strong}>No Resale:</span> Deals are for personal use only and may not be resold or transferred.</li>
        </ul>

        <h2 style={s.h2}>6. Refund Policy</h2>
        <p style={s.p}>
          Refund requests are handled on a case-by-case basis. You may be eligible for a refund if:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>The participating restaurant is permanently closed before your deal expires.</li>
          <li style={s.li}>The restaurant refuses to honor a valid, unexpired deal.</li>
          <li style={s.li}>There was a technical error in the purchase process.</li>
        </ul>
        <p style={s.p}>
          To request a refund, contact support@dealspro.ai within 7 days of the issue. Refunds are not available for expired or redeemed deals.
        </p>

        <h2 style={s.h2}>7. Creator/Influencer Program</h2>
        <p style={s.p}>
          DealsPro offers a Creator Program where influencers can earn commissions by promoting deals to their audience. Creator terms, commission rates, and payout schedules are governed by a separate Creator Agreement provided upon enrollment.
        </p>

        <h2 style={s.h2}>8. Prohibited Conduct</h2>
        <p style={s.p}>You agree not to:</p>
        <ul style={s.ul}>
          <li style={s.li}>Use DealsPro for any unlawful purpose</li>
          <li style={s.li}>Provide false or misleading information</li>
          <li style={s.li}>Attempt to purchase deals using automated bots or scripts</li>
          <li style={s.li}>Resell, transfer, or commercially exploit deals</li>
          <li style={s.li}>Interfere with the operation of our platform</li>
          <li style={s.li}>Impersonate another person or entity</li>
        </ul>

        <h2 style={s.h2}>9. Intellectual Property</h2>
        <p style={s.p}>
          All content on dealspro.ai, including text, graphics, logos, and software, is the property of DealsPro or its licensors and is protected by intellectual property laws. You may not reproduce, distribute, or create derivative works from any content without our written permission.
        </p>

        <h2 style={s.h2}>10. Disclaimer of Warranties</h2>
        <p style={s.p}>
          DealsPro is provided "as is" and "as available" without warranties of any kind. We do not guarantee the availability of any specific deal, the quality of food or service at participating restaurants, or uninterrupted access to our platform.
        </p>

        <h2 style={s.h2}>11. Limitation of Liability</h2>
        <p style={s.p}>
          To the fullest extent permitted by law, DealsPro shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of our services. Our total liability shall not exceed the amount you paid for the specific deal giving rise to the claim.
        </p>

        <h2 style={s.h2}>12. Governing Law</h2>
        <p style={s.p}>
          These Terms are governed by the laws of the State of Texas, without regard to its conflict of law provisions. Any disputes shall be resolved in the courts located in Collin County, Texas.
        </p>

        <h2 style={s.h2}>13. Changes to These Terms</h2>
        <p style={s.p}>
          We may update these Terms from time to time. Material changes will be posted on this page with a revised date. Your continued use of DealsPro after changes are posted constitutes acceptance of the updated Terms.
        </p>

        <h2 style={s.h2}>14. Contact Us</h2>
        <p style={s.p}>
          If you have questions about these Terms, contact us at:
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
