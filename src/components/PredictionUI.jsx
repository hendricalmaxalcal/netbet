import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown, TrendingUp } from "lucide-react";
import { predictOutcome } from "../data/predictions";
import { fetchSports, fetchLeaguesForSport, fetchTeamsForLeague, fetchH2H } from "../data/firestoreService";
import logo from "../../public/netbet.png";
import "../styles/netbet.css";

function initials(name) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("");
}

function formDotClass(result) {
  if (result === "W") return "nb-form-dot nb-form-dot-win";
  if (result === "L") return "nb-form-dot nb-form-dot-loss";
  return "nb-form-dot nb-form-dot-draw";
}

function FormDots({ form }) {
  return (
    <div className="nb-form-dots">
      {form.map((r, i) => (
        <div key={i} title={r} className={formDotClass(r)}>
          {r}
        </div>
      ))}
    </div>
  );
}

function TeamPanel({ team, side }) {
  const badgeClass = side === "Home" ? "nb-team-badge nb-team-badge-home" : "nb-team-badge nb-team-badge-away";
  return (
    <div className="nb-team-panel">
      <div className="nb-team-panel-header">
        <div className={badgeClass}>{initials(team.name)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="nb-team-name">{team.name}</div>
          <div className="nb-team-side">{side}</div>
        </div>
      </div>

      <div className="nb-team-stat-row">
        <span className="nb-stat-label">Power rating</span>
        <span className="nb-stat-value">{team.rating}</span>
      </div>

      <div className="nb-form-block">
        <span className="nb-stat-label">Last 5</span>
        <FormDots form={team.form} />
      </div>
    </div>
  );
}

function ConfidenceBar({ pHome, pDraw, pAway, hasDraws, nameA, nameB }) {
  const showDraw = hasDraws && pDraw > 0;
  return (
    <div>
      <div className="nb-confidence-pcts">
        <span className="nb-confidence-pct-home" style={{ width: `${pHome}%` }}>{pHome}%</span>
        {showDraw && <span className="nb-confidence-pct-draw" style={{ width: `${pDraw}%` }}>{pDraw}%</span>}
        <span className="nb-confidence-pct-away" style={{ width: `${pAway}%` }}>{pAway}%</span>
      </div>
      <div className="nb-confidence-track">
        <div className="nb-confidence-seg-home" style={{ width: `${pHome}%` }} />
        {showDraw && <div className="nb-confidence-seg-draw" style={{ width: `${pDraw}%` }} />}
        <div className="nb-confidence-seg-away" style={{ width: `${pAway}%` }} />
      </div>
      <div className="nb-confidence-names">
        <span>{nameA}</span>
        {showDraw && <span>Draw</span>}
        <span>{nameB}</span>
      </div>
    </div>
  );
}

export default function PredictionUI() {
  const params = useParams();

  const [sports, setSports] = useState(null);
  const [sportKey, setSportKey] = useState(params.sport || "football");

  const [leagues, setLeagues] = useState(null);
  const [leagueKey, setLeagueKey] = useState(null);

  const [teamsList, setTeamsList] = useState([]);
  const [teamAId, setTeamAId] = useState(null);
  const [teamBId, setTeamBId] = useState(null);

  const [h2h, setH2h] = useState(null);
  const [error, setError] = useState(null);

  // Load the sports lookup once (for labels + hasDraws flags).
  useEffect(() => {
    fetchSports()
      .then(setSports)
      .catch((err) => {
        console.error(err);
        setError("Could not load sports data.");
      });
  }, []);

  // Whenever the sport changes, load its leagues and pick an initial one.
  useEffect(() => {
    setLeagues(null);
    fetchLeaguesForSport(sportKey)
      .then((data) => {
        setLeagues(data);
        const keys = Object.keys(data);
        const initial = params.league && data[params.league] ? params.league : keys[0];
        setLeagueKey(initial);
      })
      .catch((err) => {
        console.error(err);
        setError("Could not load leagues for this sport.");
      });
  }, [sportKey]);

  // Whenever the league changes, load its teams and pick two initial teams.
  useEffect(() => {
    if (!leagueKey) return;
    setTeamsList([]);
    fetchTeamsForLeague(leagueKey)
      .then((teams) => {
        setTeamsList(teams);
        const aMatch = teams.find((t) => t.id === params.teamA);
        const aId = aMatch ? aMatch.id : teams[0]?.id;
        const bMatch = teams.find((t) => t.id === params.teamB && t.id !== aId);
        const bId = bMatch ? bMatch.id : teams.find((t) => t.id !== aId)?.id;
        setTeamAId(aId);
        setTeamBId(bId);
      })
      .catch((err) => {
        console.error(err);
        setError("Could not load teams for this league.");
      });
  }, [leagueKey]);

  // Whenever both teams are set, look up their head-to-head record.
  useEffect(() => {
    if (!leagueKey || !teamAId || !teamBId) {
      setH2h(null);
      return;
    }
    fetchH2H(leagueKey, teamAId, teamBId)
      .then(setH2h)
      .catch((err) => {
        console.error(err);
        setH2h(null);
      });
  }, [leagueKey, teamAId, teamBId]);

  const teamA = teamsList.find((t) => t.id === teamAId);
  const teamB = teamsList.find((t) => t.id === teamBId);
  const hasDraws = sports?.[sportKey]?.hasDraws ?? false;

  const prediction = useMemo(() => {
    if (!teamA || !teamB) return { pHome: 0, pDraw: 0, pAway: 0 };
    return predictOutcome(teamA.rating, teamB.rating, hasDraws);
  }, [teamA, teamB, hasDraws]);

  function handleSportChange(key) {
    setSportKey(key);
  }

  function handleLeagueChange(key) {
    setLeagueKey(key);
  }

  function handleTeamAChange(id) {
    setTeamAId(id);
  }

  function handleTeamBChange(id) {
    setTeamBId(id);
  }

  const dataReady = sports && leagues && leagueKey && teamA && teamB;

  return (
    <div className="nb-page">
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />

      <div className="nb-container-narrow">
        <div className="nb-header">
          <img src={logo} alt="Netbet logo" className="nb-logo" />
          <span className="nb-title">NETBET</span>
        </div>

        {error ? (
          <div className="nb-empty-note">{error}</div>
        ) : !dataReady ? (
          <div className="nb-empty-note">Loading matchup…</div>
        ) : (
          <>
            <div className="nb-tab-row">
              {Object.keys(sports).map((key) => (
                <button
                  key={key}
                  onClick={() => handleSportChange(key)}
                  className={`nb-tab ${key === sportKey ? "active-amber" : ""}`}
                >
                  {sports[key].label}
                </button>
              ))}
            </div>

            <div className="nb-league-row nb-select-wrap">
              <select value={leagueKey} onChange={(e) => handleLeagueChange(e.target.value)} className="nb-select">
                {Object.entries(leagues).map(([key, l]) => (
                  <option key={key} value={key}>
                    {l.label} — {l.country}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="nb-select-icon" />
            </div>

            <div className="nb-team-select-row">
              <div className="nb-select-wrap">
                <select value={teamAId} onChange={(e) => handleTeamAChange(e.target.value)} className="nb-select">
                  {teamsList
                    .filter((t) => t.id !== teamBId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <ChevronDown size={14} className="nb-select-icon" />
              </div>
              <div className="nb-select-wrap">
                <select value={teamBId} onChange={(e) => handleTeamBChange(e.target.value)} className="nb-select">
                  {teamsList
                    .filter((t) => t.id !== teamAId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <ChevronDown size={14} className="nb-select-icon" />
              </div>
            </div>

            <div className="nb-matchup-row">
              <TeamPanel team={teamA} side="Home" />
              <div className="nb-vs-divider">VS</div>
              <TeamPanel team={teamB} side="Away" />
            </div>

            <div className="nb-panel-card">
              <div className="nb-panel-card-header">
                <TrendingUp size={14} color="var(--nb-text-muted)" />
                <span className="nb-panel-label">Win probability</span>
              </div>
              <ConfidenceBar
                pHome={prediction.pHome}
                pDraw={prediction.pDraw}
                pAway={prediction.pAway}
                hasDraws={hasDraws}
                nameA={teamA.name}
                nameB={teamB.name}
              />
            </div>

            <div className="nb-panel-card">
              <span className="nb-panel-label">Head-to-head</span>
              {h2h ? (
                <div style={{ marginTop: 12 }}>
                  <div className="nb-h2h-wins-row">
                    <span className="nb-h2h-wins-home">{h2h.aWins} wins</span>
                    <span className="nb-h2h-wins-away">{h2h.bWins} wins</span>
                  </div>
                  <FormDots form={h2h.results} />
                </div>
              ) : (
                <div className="nb-empty-note">No recorded meetings yet</div>
              )}
            </div>

            <div className="nb-footnote">
              Predictions generated from power ratings, recent form, and head-to-head history
            </div>
          </>
        )}
      </div>
    </div>
  );
}