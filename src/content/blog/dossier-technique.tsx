// src/content/blog/dossier-technique.tsx
// -------------------------------------------------------------------------------------------------
// Article : Le dossier technique au Cameroun
// -------------------------------------------------------------------------------------------------

export default function DossierTechniqueArticle() {
  return (
    <>
      <p>
        Le <strong>dossier technique</strong> est l'ensemble des documents topographiques
        et géométriques qui matérialisent physiquement une parcelle de terrain. Établi
        par un <strong>géomètre-expert assermenté</strong>, il constitue la base
        indispensable de toute procédure d'immatriculation foncière au Cameroun.
        Aucun titre foncier ne peut être délivré sans son dépôt préalable au cadastre.
      </p>

      <h2>Que contient un dossier technique ?</h2>
      <ol>
        <li>
          Un <strong>procès-verbal de bornage</strong> : signé par le géomètre, les
          propriétaires limitrophes (voisins) et l'autorité traditionnelle (chef de
          village ou de quartier) le jour de l'opération sur le terrain.
        </li>
        <li>
          Un <strong>plan de bornage régulier</strong> à l'échelle, indiquant la
          forme et les dimensions de la parcelle, les coordonnées géographiques de
          chaque borne et les noms des riverains.
        </li>
        <li>
          Un <strong>calcul de superficie</strong> certifié, calculé par la méthode
          des coordonnées rectangulaires.
        </li>
        <li>
          Un <strong>plan de situation</strong> permettant de localiser la parcelle
          dans son contexte (quartier, route, repères géographiques).
        </li>
        <li>
          Des <strong>fiches de levé</strong> détaillant la méthodologie utilisée
          (GPS différentiel, station totale, etc.).
        </li>
      </ol>

      <h2>Qui peut établir un dossier technique ?</h2>
      <p>
        Uniquement un <strong>géomètre-expert agréé</strong> par l'Ordre national
        des géomètres-experts du Cameroun (ONGEC). Ces professionnels disposent d'un
        numéro d'agrément que vous pouvez vérifier auprès de l'Ordre. Un levé réalisé
        par une personne non agréée n'a aucune valeur légale et sera rejeté par le
        cadastre.
      </p>

      <blockquote>
        Astuce : demandez systématiquement le <em>numéro d'agrément ONGEC</em> du
        géomètre avant de signer un devis. Un professionnel sérieux le fournit sans
        difficulté.
      </blockquote>

      <h2>L'opération de bornage sur le terrain</h2>
      <p>
        Le bornage est un moment décisif. Le géomètre se déplace avec son équipement
        et procède en présence obligatoire :
      </p>
      <ul>
        <li>du demandeur (propriétaire revendiquant la parcelle),</li>
        <li>de tous les <strong>voisins immédiats</strong> dûment convoqués par écrit,</li>
        <li>de l'autorité coutumière locale (chef de village ou de quartier),</li>
        <li>
          parfois d'un représentant de la sous-préfecture pour les zones rurales
          sensibles.
        </li>
      </ul>
      <p>
        Les bornes (généralement en béton armé numérotées) sont implantées aux
        sommets de la parcelle. Le procès-verbal est signé séance tenante par toutes
        les parties — c'est cette signature qui rend les limites <strong>opposables
        aux tiers</strong>.
      </p>

      <h2>Coûts pratiqués au Cameroun</h2>
      <p>
        Les tarifs varient selon la taille, l'accessibilité et la région :
      </p>
      <ul>
        <li>
          Petite parcelle urbaine (≤ 500 m²) : <strong>150 000 à 400 000 FCFA</strong>
        </li>
        <li>
          Parcelle moyenne (500 m² à 1 ha) :{" "}
          <strong>400 000 à 900 000 FCFA</strong>
        </li>
        <li>
          Terrain rural ou difficile d'accès : sur devis, peut dépasser{" "}
          <strong>1 500 000 FCFA</strong>
        </li>
      </ul>
      <p>
        Ces montants incluent généralement le déplacement, les bornes physiques, les
        formalités administratives et le tirage des plans en plusieurs exemplaires.
      </p>

      <h2>Pièges à éviter</h2>
      <ul>
        <li>
          <strong>Voisins absents le jour J</strong> : le procès-verbal pourra être
          contesté plus tard. Insistez pour qu'ils signent (à défaut, faites
          enregistrer une convocation par huissier).
        </li>
        <li>
          <strong>Bornes en bois</strong> : illégales. Exigez des bornes en béton
          armé numérotées.
        </li>
        <li>
          <strong>Dossier sans coordonnées géographiques</strong> : impossible à
          retrouver en cas de litige. Le levé doit comporter les coordonnées de
          chaque sommet.
        </li>
      </ul>

      <h2>Combien de temps cela prend-il ?</h2>
      <p>
        Du devis à la remise du dossier complet : <strong>3 à 8 semaines</strong> en
        fonction de la disponibilité des voisins et de la rapidité administrative du
        cadastre pour la <em>validation</em>. Cette validation préalable est exigée
        avant le dépôt à la conservation foncière.
      </p>

      <h2>En résumé</h2>
      <p>
        Le dossier technique est la <strong>fondation matérielle</strong> de votre
        future propriété. Ne le confiez qu'à un géomètre agréé, exigez la présence
        des voisins le jour du bornage, et conservez précieusement le procès-verbal
        original — il vaut son pesant d'or en cas de contentieux foncier.
      </p>
    </>
  );
}
