// convex/email-templates.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Templates HTML inline pour les notifications par email.
//
//  Contraintes des clients mail :
//   - Pas de CSS externe (chaque client a sa whitelist).
//   - Pas de Flexbox/Grid stable → on revient à <table> pour la mise en page.
//   - Styles inlinés sur chaque élément (Gmail strip parfois les <style>).
//   - Images via URLs publiques (Convex storage / Unsplash) — pas d'inline base64.
//   - Texte alternatif pour les boutons (les clients web rendent souvent en mode plain).
//
//  Charte appliquée :
//   - Accent rouge #D60036 sur le bouton CTA (cohérent avec l'app)
//   - Bleu #003a7c pour les titres
//   - Layout 600px max-width centré (standard email)
//
//  Sécurité : on échappe systématiquement les contenus user-provided (nom,
//   titre annonce, body message) via `esc()` pour éviter l'injection HTML.
// -------------------------------------------------------------------------------------------------

interface CommonProps {
  recipientName: string;
  senderName: string;
  propertyTitle: string;
  propertyImage?: string;
  messageBody: string;
  threadUrl: string;
}

/**
 * Échappe les caractères HTML spéciaux pour empêcher l'injection.
 * Strict minimum (`& < > " '`) — suffisant pour des champs textuels.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tronque un texte de plus de N caractères en ajoutant une ellipse.
 */
function truncate(s: string, n: number): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > n ? trimmed.slice(0, n - 1) + "…" : trimmed;
}

/**
 * Layout commun à tous les emails : header marque, body, CTA, footer.
 * Param `intro` = phrase de présentation (différente selon le type d'event).
 */
function renderLayout(opts: {
  preheader: string; // texte invisible affiché par Gmail/Apple Mail en aperçu
  intro: string;
  data: CommonProps;
  ctaLabel: string;
}): string {
  const { intro, data, ctaLabel, preheader } = opts;
  const safeSender = esc(data.senderName);
  const safeProperty = esc(data.propertyTitle);
  const safeBody = esc(truncate(data.messageBody, 400));
  const safeRecipient = esc(data.recipientName);
  const heroImg = data.propertyImage ? esc(data.propertyImage) : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Osy-Immo</title>
</head>
<body style="margin:0;padding:0;background:#f7fafd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <!-- Preheader : texte invisible affiché en aperçu inbox -->
  <div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafd;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px -8px rgba(15,23,42,0.16);">
          <!-- Header marque -->
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #eef5fc;">
              <span style="font-size:18px;font-weight:600;color:#003a7c;">
                <span style="color:#d60036;">🏠</span> Osy-Immo
              </span>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:24px 24px 8px;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">Bonjour ${safeRecipient},</p>
              <p style="margin:0;font-size:16px;line-height:1.5;color:#0f172a;">${intro}</p>
            </td>
          </tr>

          ${heroImg ? `
          <!-- Image annonce -->
          <tr>
            <td style="padding:16px 24px 0;">
              <img src="${heroImg}" alt="" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;display:block;" />
            </td>
          </tr>` : ""}

          <!-- Carte annonce + extrait message -->
          <tr>
            <td style="padding:16px 24px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafd;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Annonce</p>
                    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#003a7c;">${safeProperty}</p>
                    <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Message de ${safeSender}</p>
                    <p style="margin:0;font-size:14px;line-height:1.5;color:#0f172a;white-space:pre-wrap;">${safeBody}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:24px 24px 8px;">
              <a href="${esc(data.threadUrl)}"
                 style="display:inline-block;padding:12px 28px;background:#d60036;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">
                ${esc(ctaLabel)}
              </a>
            </td>
          </tr>

          <!-- Lien de secours -->
          <tr>
            <td style="padding:0 24px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Si le bouton ne fonctionne pas, copie ce lien :<br>
                <a href="${esc(data.threadUrl)}" style="color:#0057ba;word-break:break-all;">${esc(data.threadUrl)}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #eef5fc;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                Tu reçois cet email parce que tu utilises Osy-Immo.<br>
                Réponds directement depuis l'app pour continuer la conversation.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Email envoyé au PROPRIÉTAIRE quand un acheteur démarre une conversation.
 * Premier point de contact — on insiste sur le ton "nouvelle opportunité".
 */
export function renderNewConversationEmail(data: CommonProps): {
  subject: string;
  html: string;
} {
  return {
    subject: `${data.senderName} est intéressé(e) par votre annonce`,
    html: renderLayout({
      preheader: `${data.senderName} : ${truncate(data.messageBody, 80)}`,
      intro: `<strong>${esc(data.senderName)}</strong> vient de t'envoyer un message à propos de ton annonce. Réponds-lui rapidement pour maximiser tes chances de conclure.`,
      data,
      ctaLabel: "Lire et répondre",
    }),
  };
}

/**
 * Email envoyé à l'un des participants quand l'autre poste un nouveau message
 * dans une conversation existante.
 */
export function renderNewMessageEmail(data: CommonProps): {
  subject: string;
  html: string;
} {
  return {
    subject: `Nouveau message de ${data.senderName}`,
    html: renderLayout({
      preheader: `${data.senderName} : ${truncate(data.messageBody, 80)}`,
      intro: `<strong>${esc(data.senderName)}</strong> t'a envoyé un nouveau message dans votre conversation.`,
      data,
      ctaLabel: "Répondre",
    }),
  };
}

// -------------------------------------------------------------------------------------------------
// Email "Vérification d'adresse email" (envoyé à l'inscription)
//
// Déclenché par BetterAuth quand un nouvel utilisateur s'inscrit via signUp.email
// (callback `sendVerificationEmail` dans convex/auth.ts).
//
// UX :
//   - Tant que l'utilisateur n'a pas cliqué sur le lien, son compte existe mais
//     ne peut pas se connecter (BetterAuth bloque avec EMAIL_NOT_VERIFIED).
//   - Lien valable 24h par défaut (config BetterAuth).
//   - Au clic, BetterAuth marque user.emailVerified = true et redirige sur
//     /auth/email-verified (ou auto-signin si autoSignInAfterVerification: true).
//
// Template :
//   - Même structure que reset-password (sobre, sans card annonce) mais ton plus
//     accueillant — c'est la première interaction email avec le nouveau user.
// -------------------------------------------------------------------------------------------------
export function renderEmailVerificationEmail(data: {
  recipientName: string;
  verificationUrl: string;
}): { subject: string; html: string } {
  const name = esc(data.recipientName);
  const url = esc(data.verificationUrl);
  return {
    subject: "Confirme ton adresse email · Osy-Immo",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Osy-Immo</title>
</head>
<body style="margin:0;padding:0;background:#f7fafd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <!-- Preheader invisible affiché en aperçu inbox -->
  <div style="display:none;max-height:0;overflow:hidden;">
    Bienvenue sur Osy-Immo ! Confirme ton adresse pour activer ton compte.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafd;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px -8px rgba(15,23,42,0.16);">
          <!-- Header marque -->
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #eef5fc;">
              <span style="font-size:18px;font-weight:600;color:#003a7c;">
                <span style="color:#d60036;">🏠</span> Osy-Immo
              </span>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td style="padding:32px 24px 8px;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">Bienvenue ${name},</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">
                Confirme ton adresse email
              </h1>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#475569;">
                Plus qu'une étape pour activer ton compte Osy-Immo et publier
                tes annonces. Clique sur le bouton ci-dessous pour confirmer
                cette adresse email.
              </p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#64748b;">
                Ce lien est valable <strong>24 heures</strong>.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:8px 24px 24px;">
              <a href="${url}"
                 style="display:inline-block;padding:14px 32px;background:#d60036;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;">
                Confirmer mon email
              </a>
            </td>
          </tr>

          <!-- Lien de secours (en cas où le bouton ne s'affiche pas) -->
          <tr>
            <td style="padding:0 24px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
                <a href="${url}" style="color:#0057ba;word-break:break-all;">${url}</a>
              </p>
            </td>
          </tr>

          <!-- Avertissement : compte créé par quelqu'un d'autre ? -->
          <tr>
            <td style="padding:0 24px 24px;">
              <div style="padding:12px 14px;background:#f7fafd;border-left:3px solid #003a7c;border-radius:4px;">
                <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">
                  <strong>Tu n'as pas créé de compte Osy-Immo ?</strong>
                  Ignore simplement cet email — aucun compte ne sera activé sans
                  ce clic de confirmation.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #eef5fc;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                Tu reçois cet email parce qu'un compte Osy-Immo a été créé<br>
                avec cette adresse. Cameroun · Foncier · Marketplace.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

// -------------------------------------------------------------------------------------------------
// Email "Réinitialisation de mot de passe"
//
// Déclenché par BetterAuth lorsque l'utilisateur clique sur "Mot de passe oublié ?"
// puis saisit son email. Le callback `sendResetPassword` (convex/auth.ts) appelle
// cette fonction et envoie le résultat via Resend.
//
// Sécurité :
//   - Le lien contient un token JWT signé par BetterAuth, valable ~1h par défaut.
//   - Token unique → un seul reset par lien. Si le user clique 2× dessus, le second
//     usage échoue (revoke automatique).
//   - On échappe systématiquement `recipientName` pour éviter toute injection HTML.
//   - Template SANS image d'annonce (pas pertinent ici) → on ne réutilise pas
//     renderLayout, on a un layout dédié plus court et plus sobre.
// -------------------------------------------------------------------------------------------------
export function renderResetPasswordEmail(data: {
  recipientName: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const name = esc(data.recipientName);
  const url = esc(data.resetUrl);
  return {
    subject: "Réinitialisation de ton mot de passe Osy-Immo",
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Osy-Immo</title>
</head>
<body style="margin:0;padding:0;background:#f7fafd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <!-- Preheader invisible affiché en aperçu inbox -->
  <div style="display:none;max-height:0;overflow:hidden;">
    Clique sur le lien pour choisir un nouveau mot de passe. Lien valable 1 heure.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafd;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px -8px rgba(15,23,42,0.16);">
          <!-- Header marque -->
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #eef5fc;">
              <span style="font-size:18px;font-weight:600;color:#003a7c;">
                <span style="color:#d60036;">🏠</span> Osy-Immo
              </span>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td style="padding:32px 24px 8px;">
              <p style="margin:0 0 8px;font-size:14px;color:#475569;">Bonjour ${name},</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">
                Réinitialise ton mot de passe
              </h1>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#475569;">
                Tu as demandé à réinitialiser le mot de passe de ton compte Osy-Immo.
                Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe.
              </p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#64748b;">
                Ce lien est valable <strong>1 heure</strong> et ne peut être utilisé qu'une seule fois.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:8px 24px 24px;">
              <a href="${url}"
                 style="display:inline-block;padding:14px 32px;background:#d60036;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;">
                Choisir un nouveau mot de passe
              </a>
            </td>
          </tr>

          <!-- Lien de secours (en cas où le bouton ne s'affiche pas) -->
          <tr>
            <td style="padding:0 24px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
                <a href="${url}" style="color:#0057ba;word-break:break-all;">${url}</a>
              </p>
            </td>
          </tr>

          <!-- Avertissement sécurité -->
          <tr>
            <td style="padding:0 24px 24px;">
              <div style="padding:12px 14px;background:#fff7ed;border-left:3px solid #f59e0b;border-radius:4px;">
                <p style="margin:0;font-size:12px;color:#7c2d12;line-height:1.5;">
                  <strong>Tu n'as pas demandé cette réinitialisation ?</strong>
                  Ignore simplement cet email — ton mot de passe actuel reste valide.
                  Pour plus de sécurité, vérifie qu'aucun appareil suspect n'est connecté à ton compte.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #eef5fc;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                Tu reçois cet email parce qu'une réinitialisation de mot de passe<br>
                a été demandée pour le compte Osy-Immo associé à cette adresse.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
