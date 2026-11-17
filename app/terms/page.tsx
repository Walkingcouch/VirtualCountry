import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms of use · Virtual Country' };

export default function Terms() {
  return (
    <LegalPage title="TERMS OF USE" updated="17 November 2026">
      <p>These terms are between you and First Geospatial Pty Ltd. By using Virtual Country you agree to them.</p>

      <h2>This is a demonstration</h2>
      <p>The site you are using is for testing and showing how Virtual Country works. Use invented material only. Do not record real cultural knowledge, real people or real places here.</p>

      <h2>Your material stays yours</h2>
      <p>You, and your community under its own law and protocols, keep all rights in what you record. First Geospatial claims no ownership and gets no licence to use it. We cannot read it.</p>

      <h2>Your keys are your responsibility</h2>
      <p>Your passphrase and recovery card are the only ways into your private space. We cannot reset them or open your material for you. If you lose both, what you alone hold cannot be recovered.</p>

      <h2>Using it fairly</h2>
      <ul>
        <li>Only record or share material you have the right to record or share.</li>
        <li>Follow the decisions of your community&apos;s Cultural Authorities about who may see what.</li>
        <li>Do not try to get around the locks, read other people&apos;s material, or overload the service.</li>
        <li>Keep your sign-in details to yourself.</li>
      </ul>

      <h2>Organisations and administrators</h2>
      <p>Each organisation is run by its own administrators. They approve and remove members. They cannot open stories unless a holder shares with them.</p>

      <h2>The software</h2>
      <p>The Virtual Country software is owned by First Geospatial Pty Ltd. You may use it through this site. You may not copy it or build a competing service from it.</p>

      <h2>No promises about the demonstration</h2>
      <p>The demonstration is provided as it is. It may change, be reset or be switched off. Rights you have under the Australian Consumer Law are not affected.</p>

      <h2>Changes and contact</h2>
      <p>We will say here when these terms change. Questions: <a href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a>.</p>
    </LegalPage>
  );
}
