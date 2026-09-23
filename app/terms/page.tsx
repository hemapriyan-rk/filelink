import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms of Service — Crate Link" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="23 September 2026">
      <p>
        These Terms govern your use of Crate Link (&quot;the Service&quot;), a personal,
        temporary file-sharing tool operated by Hemapriyan RK (&quot;we&quot;, &quot;us&quot;).
        By uploading a file, downloading a file, or otherwise using the Service, you agree to
        these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. What the Service is</h2>
      <p>
        Crate Link lets someone upload a file, receive a link and QR code, and share that link
        so another person can download the file until it expires or reaches its download limit.
        There are no user accounts. We do not review, curate, endorse, promote, or otherwise
        participate in choosing or distributing the files people upload — we provide the
        infrastructure; users choose what to put through it.
      </p>

      <h2>2. Your responsibility for what you upload</h2>
      <p>
        You are solely responsible for any file you upload and for anything you do with a link or
        QR code you receive. By uploading a file, you confirm that:
      </p>
      <ul>
        <li>
          you own the file or otherwise hold all rights and permissions necessary to upload it and
          to share it with the people you send the link to;
        </li>
        <li>uploading and sharing the file does not infringe anyone else&apos;s copyright, trademark, privacy, or other rights;</li>
        <li>the file, and your use of the Service generally, complies with applicable law.</li>
      </ul>

      <h2>3. Prohibited content and activity</h2>
      <p>You must not use the Service to upload, store, or share:</p>
      <ul>
        <li>content that is illegal to possess, create, or distribute under applicable law;</li>
        <li>
          child sexual abuse material (CSAM) or any content that sexually exploits or endangers
          minors — this is reported to the relevant authorities and results in an immediate,
          permanent block;
        </li>
        <li>malware, ransomware, exploits, or other content designed to damage or gain unauthorized access to a system;</li>
        <li>content that infringes copyright, trademark, or other intellectual property rights you don&apos;t hold or have permission to use;</li>
        <li>content used for fraud, phishing, impersonation, or scams;</li>
        <li>content that harasses, threatens, or unlawfully invades the privacy of any person;</li>
        <li>any other content or activity prohibited by applicable law, including the laws of India.</li>
      </ul>
      <p>
        We do not proactively scan uploaded files. We rely on reports (§6) and our own
        discretion to act on violations of this section.
      </p>

      <h2>4. No endorsement; no warranty</h2>
      <p>
        The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis, with no
        warranty of any kind, express or implied, including merchantability, fitness for a
        particular purpose, and non-infringement. We do not guarantee the Service will be
        uninterrupted, error-free, or available at any given time, and we do not guarantee that
        any file will remain available for its full stated expiration — see our Known Limitations
        in the project documentation for specific technical caveats. Nothing on the Service, and
        no file hosted through it, is endorsed, reviewed, or approved by us.
      </p>

      <h2>5. Our right to remove content or restrict access</h2>
      <p>
        We may remove, disable access to, or refuse to serve any file at our discretion,
        including (without needing to give notice) where we believe it violates §3, infringes
        someone&apos;s rights, is illegal, or where we&apos;re required to act by law or a valid
        legal request. We may also suspend or restrict access to the Service generally, for any
        user or IP address, including through the automated abuse-prevention measures described in
        our Privacy Policy.
      </p>

      <h2>6. Copyright and illegal-content reports</h2>
      <p>
        If you believe a file hosted through Crate Link infringes your copyright or other rights,
        or is illegal content described in §3, contact us at the address in §11 with:
      </p>
      <ul>
        <li>the share link (URL) of the file in question;</li>
        <li>a description of the content and why it should be removed;</li>
        <li>
          for a copyright claim, a statement that you are the rights holder or authorized to act
          on their behalf, and a good-faith statement that the use is not authorized;
        </li>
        <li>your contact information.</li>
      </ul>
      <p>
        We aim to act promptly on credible reports, up to and including immediate removal, without
        prior notice to the uploader where the content is illegal (e.g. CSAM) or the report is
        otherwise clearly valid.
      </p>

      <h2>7. Legal requests and evidence preservation</h2>
      <p>
        We will respond to valid legal requests from courts and government authorities to the
        extent required by applicable law, including the Indian Information Technology Act, 2000
        and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code)
        Rules, 2021, as an intermediary. Where legally required, we will preserve relevant records
        (including the metadata described in our Privacy Policy) for the period required by law or
        a specific lawful request, even where our normal retention practices would otherwise not
        keep that record.
      </p>

      <h2>8. The admin override</h2>
      <p>
        The Service has one non-account-based override mechanism (a rotating authenticator code)
        that lets its operator raise the standard file-size and expiration limits, or mark a file
        as kept permanently, for a specific upload. This exists purely for the operator&apos;s own
        use of their own tool and does not change any other term in this document — content
        uploaded through the override is still subject to §§2–3 like anything else.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for any indirect, incidental,
        or consequential damages arising from your use of the Service, including loss of data,
        loss of access to a file before or after its stated expiration, or any content a third
        party uploads or downloads through the Service. Because this is a personal tool provided
        without charge, our total liability for any claim relating to the Service is limited to
        the greatest extent permitted by applicable law.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time; the &quot;Last updated&quot; date above will
        reflect the most recent change. Continued use of the Service after a change constitutes
        acceptance of the updated Terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        For takedown requests, illegal-content reports, or legal inquiries, contact:{" "}
        <a href="mailto:1.connectwithhemapriyan@gmail.com">1.connectwithhemapriyan@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
