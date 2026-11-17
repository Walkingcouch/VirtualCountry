import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';

export const metadata: Metadata = { title: 'ICIP statement · Virtual Country' };

export default function Icip() {
  return (
    <LegalPage title="ICIP STATEMENT" updated="17 November 2026">
      <p>ICIP means Indigenous Cultural and Intellectual Property: the rights First Nations peoples have in their knowledge, stories, language, places, images and cultural expression. Virtual Country is built so those rights stay with the people and communities they belong to.</p>

      <h2>What we commit to</h2>
      <ul>
        <li><strong>Ownership stays with holders and communities.</strong> First Geospatial does not own, license or use any cultural material placed in Virtual Country.</li>
        <li><strong>Control is enforced by keys.</strong> A holder decides who can open an item. Only those people receive a key. Administrators and First Geospatial hold none.</li>
        <li><strong>Cultural authority is respected.</strong> Men&apos;s and women&apos;s knowledge is opened only to people whose standing a Cultural Authority has confirmed. Sacred and paused material can never be published.</li>
        <li><strong>Consent is recorded and can change.</strong> Each item carries who gave consent, how, and for which uses. A holder can change access, pause an item for sorry business, or delete it.</li>
        <li><strong>Nothing goes public without sign-off.</strong> A public summary is written separately, the location is generalised, and a Cultural Authority of that community must sign it. It can be withdrawn.</li>
        <li><strong>Decisions can be checked.</strong> Every action is in a governance log that cannot be edited without detection.</li>
        <li><strong>No AI training.</strong> Cultural material is never used to train AI. The in-app helper is given no story content.</li>
        <li><strong>Data stays on Country or in Australia.</strong> For real use, storage is chosen with each community and never placed on overseas-controlled hyperscale cloud.</li>
      </ul>

      <h2>What guides us</h2>
      <p>The CARE Principles for Indigenous Data Governance (Collective benefit, Authority to control, Responsibility, Ethics), the AIATSIS Code of Ethics for Aboriginal and Torres Strait Islander Research, and the protocols each community sets for itself. Where a community&apos;s protocol and this platform differ, the community&apos;s protocol comes first and the platform is changed.</p>

      <h2>Limits you should know about</h2>
      <p>Technology cannot stop a person who is allowed to open something from repeating it. Keys control access; cultural law and agreements govern what people do with what they know. Each community should have its own data governance agreement before real material is recorded.</p>

      <h2>Contact</h2>
      <p>To raise a concern about how cultural material is handled: <a href="mailto:contact@firstgeospatial.com.au">contact@firstgeospatial.com.au</a>.</p>
    </LegalPage>
  );
}
