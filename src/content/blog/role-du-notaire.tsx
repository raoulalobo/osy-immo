// src/content/blog/role-du-notaire.tsx
// -------------------------------------------------------------------------------------------------
// Article : Le rôle du notaire dans une transaction foncière au Cameroun
// Ce composant rend UNIQUEMENT le corps de l'article (paragraphes + titres + listes).
// La carte d'en-tête, l'image hero et les meta sont rendus par `routes/blog.$slug.tsx`.
// -------------------------------------------------------------------------------------------------

export default function RoleDuNotaireArticle() {
  return (
    <>
      <p>
        Au Cameroun, aucune vente de terrain titré n'est juridiquement valable sans
        passer devant un <strong>notaire</strong>. Officier public nommé par décret
        présidentiel, le notaire est le seul professionnel habilité à donner à votre
        transaction la forme <strong>authentique</strong> exigée par la loi — celle
        qui permet ensuite la mutation du titre foncier à votre nom. Comprendre son
        rôle, c'est savoir exactement ce que vous payez et ce que vous êtes en droit
        d'exiger de lui.
      </p>

      <blockquote>
        L'ordonnance n° 74-1 du 6 juillet 1974 fixant le régime foncier impose la
        forme notariée pour tous les actes constitutifs, translatifs ou extinctifs de
        droits réels immobiliers — à peine de <strong>nullité absolue</strong>. Un
        simple « acte de vente » signé entre particuliers, même légalisé à la
        sous-préfecture, ne transfère pas la propriété.
      </blockquote>

      <h2>Qui est le notaire, exactement ?</h2>
      <p>
        Le notaire est un <strong>officier public et ministériel</strong> : il exerce
        une mission déléguée de l'État, dans un ressort territorial précis, et ses
        actes ont la même force probante qu'un jugement. Concrètement, un acte
        notarié <em>fait foi jusqu'à inscription en faux</em> — il est pratiquement
        incontestable. Les notaires camerounais sont regroupés au sein de la{" "}
        <strong>Chambre nationale des notaires du Cameroun</strong>, auprès de
        laquelle vous pouvez vérifier qu'un notaire est bien inscrit et en exercice.
      </p>

      <h2>Ses 5 missions dans une transaction foncière</h2>
      <ol>
        <li>
          <strong>Vérifier</strong> — avant toute signature, le notaire contrôle
          l'authenticité du titre foncier auprès de la conservation foncière, demande
          un <em>certificat de propriété</em> récent (charges, hypothèques,
          oppositions, saisies), vérifie l'identité et la capacité juridique des
          parties (régime matrimonial, succession ouverte, mandats).
        </li>
        <li>
          <strong>Rédiger l'acte authentique</strong> — c'est l'acte de vente
          notarié qui transfère réellement la propriété. Le notaire y consigne le
          prix réel, la désignation exacte de la parcelle (numéro de TF, superficie,
          plan) et les conditions convenues.
        </li>
        <li>
          <strong>Sécuriser le prix</strong> — le prix de vente transite par la{" "}
          <em>comptabilité du notaire</em> (compte séquestre) et n'est reversé au
          vendeur qu'une fois les vérifications accomplies. Ne payez{" "}
          <strong>jamais</strong> le vendeur de la main à la main.
        </li>
        <li>
          <strong>Accomplir les formalités fiscales</strong> — enregistrement de
          l'acte auprès de l'administration fiscale et paiement des droits de
          mutation pour le compte de l'acquéreur.
        </li>
        <li>
          <strong>Obtenir la mutation du titre</strong> — dépôt du dossier à la
          conservation foncière compétente pour que le titre foncier soit muté au nom
          de l'acheteur, puis délivrance des copies authentiques (« expéditions ») de
          l'acte.
        </li>
      </ol>

      <h2>Combien coûte le notaire ?</h2>
      <p>
        Les <strong>émoluments</strong> du notaire sont fixés par un tarif
        réglementaire dégressif : plus la valeur du bien est élevée, plus le
        pourcentage diminue. À ces honoraires s'ajoutent les{" "}
        <strong>droits d'enregistrement</strong> (perçus par l'État, calculés sur le
        prix déclaré), les frais de conservation foncière et les débours (copies,
        timbres, déplacements). Au total, comptez généralement entre{" "}
        <strong>5 % et 15 %</strong> du prix de vente selon la valeur et la
        localisation du bien. Exigez un <em>état prévisionnel des frais</em> détaillé
        avant de signer : un notaire sérieux le fournit systématiquement.
      </p>

      <h2>Attention : sous-déclarer le prix est un piège</h2>
      <p>
        Une pratique répandue consiste à déclarer dans l'acte un prix inférieur au
        prix réel pour réduire les droits d'enregistrement. C'est une{" "}
        <strong>fausse économie</strong> : en cas de litige ou d'éviction, votre
        indemnisation sera calculée sur le prix déclaré ; l'administration fiscale
        peut en outre redresser la valeur et appliquer des pénalités. Le notaire qui
        vous y encourage engage sa responsabilité — et la vôtre.
      </p>

      <h2>Le notaire ne remplace pas tout</h2>
      <p>
        Le notaire sécurise la <em>forme</em> de la transaction, mais il intervient
        sur la base des documents fonciers existants. Sur une parcelle{" "}
        <strong>non titrée</strong> (domaine national), il ne peut pas authentifier
        une vente : il faut d'abord passer par l'immatriculation. De même, le
        bornage matériel du terrain reste l'affaire du <strong>géomètre-expert</strong>{" "}
        (voir notre article sur le dossier technique). La descente sur le terrain,
        la vérification des limites réelles et l'enquête de voisinage restent des
        précautions à votre charge.
      </p>

      <h2>Comment éviter les faux intermédiaires ?</h2>
      <ul>
        <li>
          <strong>Traitez directement avec l'étude notariale</strong> — méfiez-vous
          des « démarcheurs » qui prétendent représenter un notaire et encaissent des
          acomptes en son nom.
        </li>
        <li>
          <strong>Vérifiez l'inscription du notaire</strong> auprès de la Chambre
          nationale des notaires ou du parquet du tribunal de son ressort.
        </li>
        <li>
          <strong>Exigez des reçus de l'étude</strong> pour chaque versement, tirés
          de la comptabilité officielle du notaire.
        </li>
        <li>
          <strong>Lisez l'acte avant la signature</strong> — le notaire a une
          obligation de conseil envers <em>les deux</em> parties : posez toutes vos
          questions, il doit y répondre de manière impartiale.
        </li>
      </ul>

      <h2>Ce qu'il faut retenir</h2>
      <p>
        Le notaire est le <strong>passage obligé et la meilleure assurance</strong>{" "}
        d'une transaction foncière au Cameroun : sans acte notarié, pas de mutation
        du titre foncier, donc pas de propriété opposable. Choisissez un notaire
        inscrit, faites transiter le prix par sa comptabilité, refusez la
        sous-déclaration, et gardez à l'esprit que son intervention complète — sans
        remplacer — les vérifications de terrain et le travail du géomètre-expert.
      </p>
    </>
  );
}
