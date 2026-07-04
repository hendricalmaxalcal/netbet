import { db } from "../firebase";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";

export async function fetchSports() {
  const snap = await getDocs(collection(db, "sports"));
  const sports = {};
  snap.forEach((d) => {
    sports[d.id] = d.data();
  });
  return sports;
}

export async function fetchLeaguesForSport(sportId) {
  const q = query(collection(db, "leagues"), where("sport", "==", sportId));
  const snap = await getDocs(q);
  const leagues = {};
  snap.forEach((d) => {
    leagues[d.id] = d.data();
  });
  return leagues;
}

export async function fetchTeamsForLeague(leagueId) {
  const q = query(collection(db, "teams"), where("league", "==", leagueId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchTeamsByIds(ids) {
  if (ids.length === 0) return {};
  // Firestore 'in' queries support up to 30 values at a time.
  const chunks = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

  const teams = {};
  for (const chunk of chunks) {
    const q = query(collection(db, "teams"), where("__name__", "in", chunk));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      teams[d.id] = { id: d.id, ...d.data() };
    });
  }
  return teams;
}

export async function fetchH2H(leagueId, teamAId, teamBId) {
  const key1 = `${leagueId}_${teamAId}_${teamBId}`;
  const key2 = `${leagueId}_${teamBId}_${teamAId}`;

  let snap = await getDoc(doc(db, "h2h", key1));
  if (snap.exists()) return snap.data();

  snap = await getDoc(doc(db, "h2h", key2));
  if (snap.exists()) return snap.data();

  return null;
}

export async function fetchMatchesForDate(dateStr, sportFilter) {
  let q;
  if (sportFilter && sportFilter !== "all") {
    q = query(
      collection(db, "matches"),
      where("date", "==", dateStr),
      where("sport", "==", sportFilter)
    );
  } else {
    q = query(collection(db, "matches"), where("date", "==", dateStr));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchAllLeagues() {
  const snap = await getDocs(collection(db, "leagues"));
  const leagues = {};
  snap.forEach((d) => {
    leagues[d.id] = d.data();
  });
  return leagues;
}