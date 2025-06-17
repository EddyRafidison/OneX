// scripts/scheduledTasks.js

const { pool } = require("../config/database");
const { getDate } = require("../utils/dateUtils");

/**
 * Supprime tous les comptes non activés dépassant le délai de 7 jours.
 */
async function cleanupInactiveUsers() {
  try {
    // getDate(7) renvoie [record_date 7 jours avant, record_time]
    const [dateBefore] = getDate(7);

    // Récupérer les usernames en attente d’activation depuis > 7 jours
    const rows = await pool.promiseQuery(
      "SELECT username FROM auths WHERE status = ? AND record_date = ?;",
      [0, dateBefore]
    );

    // Pour chaque utilisateur, supprimer les enregistrements dans users_stock puis dans auths
    for (const { username } of rows) {
      pool.query(
        "DELETE FROM users_stock WHERE username = ?; DELETE FROM auths WHERE username = ?;",
        [username, username],
        (err) => {
          if (err) {
            console.error(`Erreur suppression de ${username}:`, err.message);
          } else {
            console.log(`Utilisateur inactif supprimé: ${username}`);
          }
        }
      );
    }
  } catch (err) {
    console.error("Échec du nettoyage des comptes inactifs:", err);
  }
}

/**
 * Démarre la tâche planifiée.
 * Exécutée immédiatement, puis toutes les 3 heures.
 */
function startCleanupTask() {
  // Premier lancement à l’instant T
  cleanupInactiveUsers();

  // Répéter toutes les 3 heures (3 * 60 * 60 * 1000 ms)
  setInterval(cleanupInactiveUsers, 3 * 60 * 60 * 1000);
}

module.exports = { startCleanupTask };
