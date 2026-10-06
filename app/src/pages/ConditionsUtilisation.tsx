import { Link } from 'react-router-dom'
import { EMAIL_CONTACT, PageLegale } from '@/components/PageLegale'

export function ConditionsUtilisation() {
  return (
    <PageLegale titre="Conditions d'utilisation">
      <section>
        <p>
          Les présentes conditions encadrent l'utilisation de Planex, application en ligne de création d'emplois du
          temps pour les collèges et lycées, accessible à l'adresse planexci.netlify.app. En créant un compte ou en
          utilisant Planex, vous acceptez ces conditions.
        </p>
      </section>

      <section>
        <h2>1. Le service</h2>
        <p>
          Planex permet de saisir les informations d'un établissement (classes, professeurs, salles, contraintes
          horaires), de générer des emplois du temps, de les modifier, de les imprimer et de les archiver.
        </p>
      </section>

      <section>
        <h2>2. Compte</h2>
        <ul>
          <li>Vous devez fournir une adresse e-mail valide pour créer un compte.</li>
          <li>Vous êtes responsable de la confidentialité de votre mot de passe et des actions faites avec votre compte.</li>
          <li>Prévenez-nous sans attendre si vous pensez que votre compte a été utilisé sans votre accord.</li>
        </ul>
      </section>

      <section>
        <h2>3. Vos données</h2>
        <p>
          Les données que vous saisissez dans Planex restent les vôtres. Vous nous autorisez seulement à les enregistrer
          et à les traiter pour vous fournir le service. Vous vous engagez à n'y saisir que des informations que vous
          avez le droit d'utiliser, notamment celles concernant les professeurs de votre établissement. Le traitement de
          ces données est décrit dans nos{' '}
          <Link to="/confidentialite" className="text-primary underline">
            règles de confidentialité
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>4. Utilisation acceptable</h2>
        <p>Vous vous engagez à ne pas :</p>
        <ul>
          <li>tenter d'accéder aux données d'un autre établissement ou compte ;</li>
          <li>perturber le fonctionnement du service ou contourner ses protections ;</li>
          <li>utiliser Planex à des fins illégales.</li>
        </ul>
      </section>

      <section>
        <h2>5. Emplois du temps générés</h2>
        <p>
          Planex propose des emplois du temps calculés automatiquement à partir des informations saisies. Il vous
          revient de les vérifier avant de les diffuser : nous ne pouvons garantir qu'ils respectent toutes les
          contraintes propres à votre établissement, en particulier si les informations saisies sont incomplètes ou
          inexactes.
        </p>
      </section>

      <section>
        <h2>6. Disponibilité</h2>
        <p>
          Nous faisons de notre mieux pour que Planex soit accessible en permanence, sans pouvoir le garantir. Le service
          peut être interrompu pour maintenance ou évoluer (ajout, modification ou retrait de fonctionnalités). Pensez à
          imprimer ou exporter les emplois du temps importants.
        </p>
      </section>

      <section>
        <h2>7. Responsabilité</h2>
        <p>
          Planex est fourni « en l'état ». Dans les limites permises par la loi, nous ne sommes pas responsables des
          dommages indirects liés à l'utilisation du service, comme une perte de données ou une erreur dans un emploi du
          temps qui n'aurait pas été vérifié.
        </p>
      </section>

      <section>
        <h2>8. Fin d'utilisation</h2>
        <p>
          Vous pouvez cesser d'utiliser Planex à tout moment et demander la suppression de votre compte en nous écrivant.
          Nous pouvons suspendre un compte qui ne respecte pas ces conditions.
        </p>
      </section>

      <section>
        <h2>9. Modifications des conditions</h2>
        <p>
          Nous pouvons modifier ces conditions. La date de dernière mise à jour figure en haut de cette page. Continuer
          à utiliser Planex après une modification vaut acceptation des nouvelles conditions.
        </p>
      </section>

      <section>
        <h2>10. Droit applicable</h2>
        <p>Ces conditions sont soumises au droit ivoirien.</p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>Pour toute question : {EMAIL_CONTACT}.</p>
      </section>
    </PageLegale>
  )
}
