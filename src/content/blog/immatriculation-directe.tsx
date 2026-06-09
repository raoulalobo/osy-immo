// src/content/blog/immatriculation-directe.tsx
// -------------------------------------------------------------------------------------------------
// Article : L'immatriculation directe au Cameroun
// -------------------------------------------------------------------------------------------------

export default function ImmatriculationDirecteArticle() {
  return (
    <>
      <p>
        L'<strong>immatriculation directe</strong> est la procédure par laquelle un
        particulier obtient pour la première fois un titre foncier sur une parcelle
        qu'il <strong>occupe et met en valeur personnellement</strong>. Elle s'oppose
        à l'immatriculation indirecte (qui concerne les terres détenues
        traditionnellement par des collectivités coutumières).
      </p>

      <blockquote>
        Cadre légal : décret n° 76-165 du 27 avril 1976 fixant les conditions
        d'obtention du titre foncier, modifié et complété par les décrets n° 2005-481
        du 16 décembre 2005 et 2014-3211 du 29 septembre 2014.
      </blockquote>

      <h2>Qui peut demander l'immatriculation directe ?</h2>
      <p>
        Tout citoyen camerounais (ou personne morale de droit camerounais) qui
        remplit les conditions suivantes :
      </p>
      <ul>
        <li>
          <strong>Occupation effective</strong> du terrain depuis au moins 1980,
          continue et paisible.
        </li>
        <li>
          <strong>Mise en valeur</strong> visible et durable (constructions,
          plantations pérennes, exploitation agricole).
        </li>
        <li>
          Absence d'opposition légitime de tiers (voisins, collectivité, État).
        </li>
      </ul>
      <p>
        Les étrangers peuvent en bénéficier sous conditions, généralement liées à la
        durée de résidence et au type d'usage (habitation, professionnel).
      </p>

      <h2>Les 6 étapes de la procédure</h2>
      <ol>
        <li>
          <strong>Demande initiale</strong> auprès de la sous-préfecture du lieu de
          situation. La demande mentionne l'identité, la superficie approximative et
          l'usage actuel du terrain.
        </li>
        <li>
          <strong>Enquête publique</strong> ordonnée par le sous-préfet : une
          commission consultative se déplace sur le terrain pour vérifier
          l'occupation, recueillir l'avis du chef de village ou de quartier et
          enregistrer les éventuelles oppositions.
        </li>
        <li>
          <strong>Établissement du dossier technique</strong> par un géomètre agréé
          (bornage, levé, calculs).
        </li>
        <li>
          <strong>Avis favorable</strong> de la commission consultative — l'absence
          d'opposition est cruciale ici.
        </li>
        <li>
          <strong>Transmission au cadastre</strong> pour vérifications puis à la
          conservation foncière compétente.
        </li>
        <li>
          <strong>Délivrance du titre foncier</strong> au nom du demandeur, inscrit
          au livre foncier.
        </li>
      </ol>

      <h2>Pièces du dossier</h2>
      <ul>
        <li>Demande timbrée adressée au sous-préfet</li>
        <li>Photocopie certifiée conforme de la CNI</li>
        <li>Photo d'identité récente</li>
        <li>Plan de situation et plan de masse provisoires</li>
        <li>Attestation d'occupation délivrée par le chef de village/quartier</li>
        <li>Preuves de mise en valeur (factures de construction, photos datées, etc.)</li>
        <li>Quittances de paiement des taxes (notamment l'IFU si pertinent)</li>
      </ul>

      <h2>Délais réels au Cameroun</h2>
      <p>
        La loi prévoit un délai total de <strong>180 jours</strong>. Dans la
        pratique :
      </p>
      <ul>
        <li>
          Enquête publique : <strong>1 à 3 mois</strong>
        </li>
        <li>
          Dossier technique : <strong>1 à 2 mois</strong>
        </li>
        <li>
          Traitement administratif (cadastre + conservation foncière) :{" "}
          <strong>6 à 18 mois</strong>
        </li>
      </ul>
      <p>
        Comptez en moyenne <strong>1 à 3 ans</strong> entre la demande et la
        délivrance effective du titre. Les délais sont sensiblement plus courts dans
        les régions où la digitalisation du cadastre est avancée (Littoral, Centre).
      </p>

      <h2>Coûts à anticiper</h2>
      <p>
        Outre les honoraires du géomètre (cf. article{" "}
        <a href="/blog/dossier-technique">dossier technique</a>), les principaux
        frais administratifs sont :
      </p>
      <ul>
        <li>
          Droits d'immatriculation : ~<strong>30 à 50 FCFA/m²</strong> en zone rurale,
          plus élevés en zone urbaine
        </li>
        <li>
          Taxe d'enquête publique : <strong>50 000 à 150 000 FCFA</strong>
        </li>
        <li>
          Frais de conservation foncière : <strong>20 000 à 80 000 FCFA</strong>{" "}
          selon la superficie
        </li>
        <li>Timbres, photocopies, déplacements : <strong>50 000 FCFA</strong> environ</li>
      </ul>

      <h2>Pièges fréquents</h2>
      <ul>
        <li>
          <strong>Oppositions de voisins ou de famille</strong> non anticipées : la
          procédure est mise en sursis. Réglez les conflits AVANT de lancer la demande.
        </li>
        <li>
          <strong>Absence de mise en valeur</strong> : un terrain nu et inoccupé sera
          considéré comme appartenant au domaine national. Construisez ou plantez
          avant la demande.
        </li>
        <li>
          <strong>Chevauchement de revendications</strong> : si une partie du terrain
          a déjà été immatriculée au profit d'un tiers, la demande est rejetée.
        </li>
      </ul>

      <h2>En résumé</h2>
      <p>
        L'immatriculation directe est la voie royale pour transformer une occupation
        de fait en propriété de droit. Préparez-vous à un parcours administratif{" "}
        <strong>long et coûteux</strong>, mais l'investissement est sans commune
        mesure avec la sécurité juridique qu'apporte le titre foncier.
      </p>
    </>
  );
}
