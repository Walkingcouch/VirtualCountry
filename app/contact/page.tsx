import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Contact · Virtual Country' };

export default function Contact() {
  return (
    <LegalPage title="CONTACT" updated="17 November 2026">
      <p>Virtual Country is made and run by First Geospatial Pty Ltd, led by Johnathan Ah Chee, Managing Director.</p>

      <h2>Email</h2>
      <p><a href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a></p>

      <h2>What we can help with</h2>
      <ul>
        <li>Trouble signing in or confirming your email.</li>
        <li>Setting up a community or partner organisation.</li>
        <li>Questions about privacy, consent or how the locks work.</li>
        <li>Reporting a problem or a security concern.</li>
        <li>Asking for something to be taken down from the public page.</li>
      </ul>

      <h2>What we cannot do</h2>
      <p>We cannot read your stories or messages, reset your passphrase, or open anything on your behalf. Keep your recovery card somewhere safe.</p>

      <h2>When you write to us</h2>
      <p>Tell us which screen you were on and what happened. Do not send your passphrase, your recovery card or any cultural material by email.</p>
    </LegalPage>
  );
}
