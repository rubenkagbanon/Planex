import { EMAIL_CONTACT, PageLegale } from '@/components/PageLegale'

export function Confidentialite() {
  return (
    <PageLegale titre="Règles de confidentialité">
      <section>
        <p>
          Planex est une application en ligne qui aide les collèges et lycées à construire leurs emplois du temps. Cette
          page explique quelles données nous recueillons, pourquoi, et quels sont vos droits.
        </p>
      </section>

      <section>
        <h2>1. Données que nous recueillons</h2>
        <p>Données de compte :</p>
        <ul>
          <li>votre adresse e-mail et votre mot de passe (enregistré sous forme chiffrée) ;</li>
          <li>
            si vous vous connectez avec Google : votre nom, votre adresse e-mail et votre photo de profil, transmis par
            Google avec votre accord.
          </li>
        </ul>
        <p>Données de l'établissement, saisies ou importées par vous :</p>
        <ul>
          <li>informations sur l'établissement (nom, salles, horaires, contraintes) ;</li>
          <li>classes, matières, regroupements et volumes horaires ;</li>
          <li>noms des professeurs, matières enseignées et indisponibilités ;</li>
          <li>emplois du temps générés et leurs versions archivées.</li>
        </ul>
        <p>
          Les fichiers PDF que vous importez sont lus directement dans votre navigateur : seules les informations
          extraites sont enregistrées, pas le fichier lui-même.
        </p>
      </section>

      <section>
        <h2>2. Utilisation des données</h2>
        <p>Vos données servent uniquement à :</p>
        <ul>
          <li>vous identifier et sécuriser l'accès à votre compte ;</li>
          <li>enregistrer votre établissement et calculer vos emplois du temps ;</li>
          <li>vous envoyer les e-mails nécessaires au service (confirmation de compte, mot de passe oublié).</li>
        </ul>
        <p>
          Nous ne vendons pas vos données, ne les utilisons pas à des fins publicitaires et ne les partageons pas avec
          des tiers en dehors des prestataires techniques listés ci-dessous.
        </p>
      </section>

      <section>
        <h2>3. Données reçues de Google</h2>
        <p>
          Lorsque vous utilisez « Se connecter avec Google », Planex reçoit uniquement votre nom, votre adresse e-mail
          et votre photo de profil. Ces informations servent seulement à créer et identifier votre compte. Planex
          n'accède ni à vos e-mails, ni à vos fichiers, ni à votre agenda Google.
        </p>
        <p>
          L'utilisation des informations reçues des API Google respecte les{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-primary underline"
            target="_blank"
            rel="noreferrer"
          >
            règles relatives aux données utilisateur des services d'API Google
          </a>
          , y compris les exigences d'utilisation limitée.
        </p>
      </section>

      <section>
        <h2>4. Hébergement et prestataires</h2>
        <ul>
          <li>Supabase : base de données et authentification ;</li>
          <li>Netlify : hébergement de l'application ;</li>
          <li>Google : connexion avec un compte Google (si vous la choisissez) et polices d'écriture.</li>
        </ul>
        <p>Ces prestataires traitent les données uniquement pour faire fonctionner Planex.</p>
      </section>

      <section>
        <h2>5. Durée de conservation</h2>
        <p>
          Vos données sont conservées tant que votre compte existe. Vous pouvez à tout moment supprimer les données de
          votre établissement depuis les paramètres. Si vous demandez la suppression de votre compte, toutes les données
          associées sont effacées.
        </p>
      </section>

      <section>
        <h2>6. Sécurité</h2>
        <p>
          Les échanges avec Planex sont chiffrés (HTTPS). Chaque compte n'a accès qu'aux données de son propre
          établissement.
        </p>
      </section>

      <section>
        <h2>7. Vos droits</h2>
        <p>
          Conformément à la loi ivoirienne n° 2013-450 relative à la protection des données à caractère personnel, vous
          pouvez demander l'accès, la rectification ou la suppression de vos données, ou vous opposer à leur traitement.
          Pour cela, écrivez-nous à {EMAIL_CONTACT}. Vous pouvez aussi saisir l'ARTCI (Autorité de Régulation des
          Télécommunications/TIC de Côte d'Ivoire).
        </p>
      </section>

      <section>
        <h2>8. Modifications</h2>
        <p>
          Nous pouvons mettre à jour ces règles. La date de dernière mise à jour figure en haut de cette page. En cas de
          changement important, nous vous en informerons dans l'application ou par e-mail.
        </p>
      </section>

      <section>
        <h2>9. Contact</h2>
        <p>Pour toute question sur vos données : {EMAIL_CONTACT}.</p>
      </section>
    </PageLegale>
  )
}
