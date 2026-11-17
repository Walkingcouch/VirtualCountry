import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy · Virtual Country' };

export default function Privacy() {
  return (
    <LegalPage title="PRIVACY NOTICE" updated="17 November 2026">
      <p>Virtual Country is run by First Geospatial Pty Ltd. This notice says what we hold about you, what we cannot see, and what you can ask us to do.</p>

      <h2>What we cannot see</h2>
      <p>Stories, recordings, photos, places, consent details and messages are locked on your phone or computer before they are sent. We store only the locked copy. We do not hold the keys, so we cannot read them, and neither can your community administrator.</p>

      <h2>What we do hold</h2>
      <ul>
        <li>Your email address and a scrambled form of your password, so you can sign in.</li>
        <li>The name you choose to show, and your public security keys.</li>
        <li>Which organisations you belong to, and any roles or standing a Cultural Authority has confirmed for you.</li>
        <li>A governance log of actions: who did what and when. It never includes the content of a story or message.</li>
        <li>Facts about locked items that the service needs to work: who holds an item, who has a key, whether it is paused, and when it changed.</li>
        <li>Public summaries, which are readable by anyone on purpose, after a Cultural Authority signs them.</li>
      </ul>

      <h2>What we use it for</h2>
      <p>Only to run the service: signing you in, showing the right people the right things, and keeping a record the community can check. We do not sell information, show advertising, or use your material to train AI.</p>

      <h2>Where it is kept</h2>
      <p>This site is a demonstration. It runs on cloud services with the database in Sydney. Do not put real cultural material in the demonstration. Before any community uses Virtual Country for real material, hosting will move to Australian-owned or on-Country infrastructure agreed with that community.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Download everything you can open, from the Me screen.</li>
        <li>Delete any item you hold. The stored text, files and keys are erased.</li>
        <li>Leave an organisation at any time.</li>
        <li>Ask us to close your account or correct what we hold about you.</li>
      </ul>

      <h2>If something goes wrong</h2>
      <p>If there is a data breach that is likely to cause serious harm, we will tell the people affected and the Office of the Australian Information Commissioner, as the Privacy Act 1988 requires.</p>

      <h2>Contact</h2>
      <p>Questions or complaints: <a href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a>. If you are not happy with our answer you can contact the Office of the Australian Information Commissioner.</p>
    </LegalPage>
  );
}
