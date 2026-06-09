// src/content/blog/titre-foncier.tsx
// -------------------------------------------------------------------------------------------------
// Article : Le titre foncier au Cameroun
// Ce composant rend UNIQUEMENT le corps de l'article (paragraphes + titres + listes).
// La carte d'en-tête, l'image hero et les meta sont rendus par `routes/blog.$slug.tsx`.
// -------------------------------------------------------------------------------------------------

export default function TitreFoncierArticle() {
  return (
    <>
      <p>
        Au Cameroun, le <strong>titre foncier (TF)</strong> est l'acte officiel qui
        établit, de manière définitive et inattaquable, la propriété d'une parcelle de
        terrain. C'est la garantie juridique la plus forte qu'un acquéreur puisse
        exiger avant d'acheter un bien immobilier. Délivré par la conservation
        foncière (Ministère des Domaines, du Cadastre et des Affaires Foncières —
        MINDCAF), il fait foi jusqu'à inscription en faux.
      </p>

      <blockquote>
        Régi par l'ordonnance n° 74-1 du 6 juillet 1974 fixant le régime foncier et
        ses textes d'application, dont le décret n° 76-165 du 27 avril 1976.
      </blockquote>

      <h2>Pourquoi exiger un titre foncier ?</h2>
      <p>
        Sans titre foncier, vous achetez un risque. Les terres camerounaises sont
        classées en trois catégories : <strong>domaine national</strong> (terres non
        immatriculées, qui appartiennent à l'État jusqu'à preuve contraire),{" "}
        <strong>domaine privé</strong> (terres déjà immatriculées au nom d'un
        particulier ou d'une personne morale), et <strong>domaine public</strong>{" "}
        (voies, fleuves, terrains militaires…). Seul le domaine privé peut faire
        l'objet d'une vente sécurisée — et la preuve qu'une parcelle s'y trouve, c'est
        précisément le titre foncier.
      </p>
      <p>
        Acheter une parcelle uniquement avec un <em>acte de vente coutumier</em>, un{" "}
        <em>certificat administratif</em> ou un <em>plan de masse</em> non immatriculé
        expose à des conflits familiaux, à une revendication de l'État ou à une double
        vente.
      </p>

      <h2>Que contient un titre foncier ?</h2>
      <ul>
        <li>Le numéro d'ordre dans le livre foncier</li>
        <li>L'identité complète du propriétaire</li>
        <li>La superficie exacte (en mètres carrés)</li>
        <li>La situation géographique et le plan de bornage</li>
        <li>Les éventuelles charges ou inscriptions (hypothèques, servitudes)</li>
      </ul>

      <h2>Comment l'obtenir ?</h2>
      <p>
        Selon que la parcelle a déjà été immatriculée ou non, la procédure diffère
        substantiellement :
      </p>
      <ol>
        <li>
          Si elle relève du <strong>domaine national</strong> (jamais immatriculée),
          il faut passer par une procédure d'<strong>immatriculation directe</strong>{" "}
          ou <strong>indirecte</strong> selon que vous êtes le primo-occupant ou que
          vous achetez à une collectivité coutumière.
        </li>
        <li>
          Si elle est déjà immatriculée au nom d'un tiers, il faut une{" "}
          <strong>mutation</strong> : acte notarié de vente + dépôt à la conservation
          foncière compétente + paiement des droits d'enregistrement et de mutation.
        </li>
      </ol>

      <h2>Coûts et délais réels</h2>
      <p>
        Une mutation simple coûte généralement entre <strong>5 % et 15 %</strong> de
        la valeur déclarée (droits d'enregistrement, frais de notaire, conservation
        foncière). Les délais officiels sont de 90 jours, mais comptez en pratique{" "}
        <strong>6 à 18 mois</strong> selon la région et la complexité du dossier.
      </p>

      <h2>Pièges fréquents</h2>
      <ul>
        <li>
          <strong>Faux titres</strong> : vérifiez systématiquement l'authenticité
          auprès de la conservation foncière du chef-lieu de département où se trouve
          la parcelle, en demandant un <em>certificat de propriété</em> à jour.
        </li>
        <li>
          <strong>Titres anciens non mis à jour</strong> : un TF au nom d'un défunt
          nécessite une succession formelle avant toute vente.
        </li>
        <li>
          <strong>Inscriptions cachées</strong> : hypothèques, servitudes, oppositions —
          toutes doivent figurer sur le certificat de propriété récent.
        </li>
      </ul>

      <h2>Ce qu'il faut retenir</h2>
      <p>
        Le titre foncier est <strong>la pièce maîtresse</strong> de toute transaction
        immobilière sérieuse au Cameroun. Refusez toute parcelle proposée sans TF, ou
        accompagnez l'achat d'une procédure d'immatriculation préalable. Le coût
        supplémentaire est dérisoire face au risque d'éviction.
      </p>
    </>
  );
}
