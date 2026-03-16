export const metadata = {
  title: "Cookie Policy — DealsPro",
  description: "DealsPro cookie policy explaining how we use cookies and similar technologies.",
};

export default function CookiePolicy() {
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
    table: { width: "100%", borderCollapse: "collapse" as const, marginBottom: "24px", fontSize: "14px" },
    th: { textAlign: "left" as const, padding: "12px 16px", background: "#F7F7F8", borderBottom: "2px solid #E4E4E7", fontWeight: 600, color: "#18181B" },
    td: { padding: "12px 16px", borderBottom: "1px solid #E4E4E7", color: "#52525B" },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>Cookie Policy</h1>
        <p style={s.subtitle}>Last updated: March 15, 2026</p>
      </div>
      <div style={s.content}>
        <a href="/" style={s.back}>← Back to Home</a>

        <p style={s.p}>
          This Cookie Policy explains how DealsPro ("we," "us," or "our") uses cookies and similar tracking technologies when you visit our website at dealspro.ai. By continuing to use our website, you consent to the use of cookies as described in this policy.
        </p>

        <h2 style={s.h2}>1. What Are Cookies?</h2>
        <p style={s.p}>
          Cookies are small text files that are placed on your device (computer, smartphone, or tablet) when you visit a website. They are widely used to make websites work more efficiently, improve user experience, and provide information to website owners.
        </p>

        <h2 style={s.h2}>2. Cookies We Use</h2>
        <p style={s.p}>We use the following types of cookies on dealspro.ai:</p>

        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Type</th>
              <th style={s.th}>Purpose</th>
              <th style={s.th}>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={s.td}><span style={s.strong}>Essential</span></td>
              <td style={s.td}>Required for the website to function. These enable basic features like page navigation, form submission, and secure access.</td>
              <td style={s.td}>Session</td>
            </tr>
            <tr>
              <td style={s.td}><span style={s.strong}>Analytics</span></td>
              <td style={s.td}>Help us understand how visitors interact with our website by collecting information about pages visited, time spent, and traffic sources. This data is aggregated and anonymous.</td>
              <td style={s.td}>Up to 2 years</td>
            </tr>
            <tr>
              <td style={s.td}><span style={s.strong}>Functional</span></td>
              <td style={s.td}>Remember your preferences (such as your location or language) to provide a more personalized experience.</td>
              <td style={s.td}>Up to 1 year</td>
            </tr>
            <tr>
              <td style={s.td}><span style={s.strong}>Marketing</span></td>
              <td style={s.td}>Used to track visitors across websites to display relevant advertisements. We may use these in the future for retargeting campaigns.</td>
              <td style={s.td}>Up to 1 year</td>
            </tr>
          </tbody>
        </table>

        <h2 style={s.h2}>3. Third-Party Cookies</h2>
        <p style={s.p}>
          We may use third-party services that place cookies on your device. These include:
        </p>
        <ul style={s.ul}>
          <li style={s.li}><span style={s.strong}>Vercel Analytics:</span> Website performance and visitor analytics</li>
          <li style={s.li}><span style={s.strong}>Stripe:</span> Secure payment processing (when purchasing deals)</li>
          <li style={s.li}><span style={s.strong}>Google Analytics:</span> Website traffic analysis (if enabled)</li>
        </ul>
        <p style={s.p}>
          These third parties have their own privacy policies governing how they use the information they collect.
        </p>

        <h2 style={s.h2}>4. How to Manage Cookies</h2>
        <p style={s.p}>
          You can control and manage cookies in several ways:
        </p>
        <ul style={s.ul}>
          <li style={s.li}><span style={s.strong}>Browser settings:</span> Most browsers allow you to refuse or delete cookies through their settings. Check your browser's help documentation for instructions.</li>
          <li style={s.li}><span style={s.strong}>Opt-out links:</span> For Google Analytics, visit tools.google.com/dlpage/gaoptout</li>
        </ul>
        <p style={s.p}>
          Please note that disabling cookies may affect the functionality of our website and your ability to use certain features, such as purchasing deals.
        </p>

        <h2 style={s.h2}>5. Do Not Track</h2>
        <p style={s.p}>
          Some browsers offer a "Do Not Track" (DNT) setting. There is no industry standard for how websites should respond to DNT signals, and we currently do not respond to DNT signals. However, you can manage your cookie preferences using the methods described above.
        </p>

        <h2 style={s.h2}>6. Changes to This Policy</h2>
        <p style={s.p}>
          We may update this Cookie Policy from time to time to reflect changes in technology, regulation, or our business practices. Any updates will be posted on this page with a revised "Last updated" date.
        </p>

        <h2 style={s.h2}>7. Contact Us</h2>
        <p style={s.p}>
          If you have questions about our use of cookies, contact us at:
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
