import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy Policy — Crate Link" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="23 September 2026">
      <p>
        Crate Link is built with no user accounts and no login. This policy explains the limited
        data the Service does collect, why, and for how long.
      </p>

      <h2>1. What we collect</h2>
      <p>For every file uploaded, we store:</p>
      <ul>
        <li>the file itself, in private storage, until it expires or is deleted;</li>
        <li>its filename, size, and MIME type;</li>
        <li>a random share token (its cryptographic hash, not the raw token — see below);</li>
        <li>expiration time, download limit, and current download count;</li>
        <li>the uploading device&apos;s IP address and the upload timestamp;</li>
        <li>whether the upload used the admin override (§10 of the Terms).</li>
      </ul>
      <p>We do not collect names, email addresses, or any other account information — there is nothing to collect, since there are no accounts.</p>

      <h2>2. Why we collect the uploader&apos;s IP address</h2>
      <p>The IP address recorded at upload time is used only for:</p>
      <ul>
        <li>
          automated abuse prevention — detecting and temporarily blocking IP addresses that
          repeatedly try to exceed upload limits or brute-force the admin code;
        </li>
        <li>
          responding to valid legal requests and preserving evidence where required by law (§9 of
          the Terms) — for example, if a court or authorized government body lawfully requests
          information about who uploaded a specific reported file.
        </li>
      </ul>
      <p>
        It is never shown to anyone downloading the file, never included in any share link or QR
        code, and never used for advertising, analytics, or profiling.
      </p>

      <h2>3. Your share token is hashed, not stored raw</h2>
      <p>
        The link you receive after uploading contains a 256-bit random token. We store only its
        cryptographic hash, not the token itself — so even someone with direct access to the
        database could not reconstruct working download links from it. Anyone who has the token
        (because you shared it with them) can use it to view file info and download the file;
        that&apos;s how the Service is designed to work.
      </p>

      <h2>4. Local browser storage (not cookies)</h2>
      <p>
        With your consent (shown as a banner on first visit), the Service uses your browser&apos;s
        own storage — not a cookie sent to our server — for two things:
      </p>
      <ul>
        <li>
          <strong>Session storage:</strong> your most recent upload result(s), so switching tabs
          or an accidental refresh doesn&apos;t lose a link/QR code you haven&apos;t copied yet.
          Cleared automatically when you close the tab.
        </li>
        <li>
          <strong>Local storage:</strong> up to your last 20 upload results (&quot;Recent
          links&quot;), so you can find an old link again without keeping a tab open. Stays until
          you clear it or clear your browser&apos;s site data.
        </li>
      </ul>
      <p>
        Nothing in either is ever transmitted to us — it stays in your browser. Declining consent
        means neither is written.
      </p>

      <h2>5. How long we keep things</h2>
      <p>
        <strong>File content</strong> is deleted from storage once its link expires, reaches its
        download limit, or is kept permanently reversed — enforced immediately at the link level
        (an expired link stops working the instant it expires, regardless of when the underlying
        file is physically removed), with physical removal following shortly after via an
        automated cleanup process.
      </p>
      <p>
        <strong>The associated record</strong> (filename, size, timestamps, uploader IP, and
        download count — not the file content) is retained indefinitely after the file itself is
        deleted, for abuse-prevention, security, and legal-compliance purposes described in §2.
        This matches what the Service actually does today; if that changes, this policy will be
        updated to match, consistent with our commitment that our stated practices reflect our
        actual ones.
      </p>

      <h2>6. Who can access this data</h2>
      <p>
        Only the Service&apos;s operator, via credentials that never reach the browser or any
        third party. The database enforces default-deny access at the database level for every
        role except the server itself. We do not sell, rent, or share this data with third
        parties, except where required to respond to a valid legal request (§9 of the Terms).
      </p>

      <h2>7. Children&apos;s privacy</h2>
      <p>
        The Service is not directed at children and is not designed to knowingly collect personal
        information from them.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this policy from time to time; the &quot;Last updated&quot; date above
        reflects the most recent change.
      </p>

      <h2>9. Contact</h2>
      <p>
        For privacy questions, contact:{" "}
        <a href="mailto:1.connectwithhemapriyan@gmail.com">1.connectwithhemapriyan@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
