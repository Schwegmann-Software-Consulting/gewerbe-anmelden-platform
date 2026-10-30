// XGewerbeanzeige (XÖV-Standard). Kommunen tauschen Gewerbeanzeigen untereinander in diesem
// Format aus. Ein Zugang für private Einreicher ist nicht vorgesehen; der Adapter ist für den Fall
// angelegt, dass eine Kommune oder ein Landesportal eine Annahmeschnittstelle bereitstellt.
export async function sendXGewerbe({ app }) {
  throw new Error(`XGewerbeanzeige-Übermittlung ist noch nicht angebunden (${app.ref})`);
}
