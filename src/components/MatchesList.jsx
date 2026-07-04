import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { predictOutcome, predictScoreline } from "../data/predictions";
import { fetchSports, fetchAllLeagues, fetchTeamsByIds, fetchMatchesForDate } from "../data/firestoreService";
import logo from "../../public/netbet.png";
import "../styles/netbet.css";

const DAY_OFFSETS = [-3, -2, -1, 0, 1, 2];

function dateStrForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

function labelForDate(dateStr) {
  const todayStr = dateStrForOffset(0);
  const yesterdayStr = dateStrForOffset(-1);
  const tomorrowStr = dateStrForOffset(1);

  if (dateStr === todayStr) return "Today";
  if (dateStr === tomorrowStr) return "Tomorrow";
  if (dateStr === yesterdayStr) return "Yesterday";

  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function pickFromProbabilities(pHome, pDraw, pAway) {
  if (pDraw >= pHome && pDraw >= pAway) return "draw";
  return pHome >= pAway ? "home" : "away";
}

function pickFromResult(result, hasDraws) {
  if (hasDraws && result.h === result.a) return "draw";
  return result.h > result.a ? "home" : "away";
}

function ProbBar({ pHome, pDraw, pAway, hasDraws }) {
  return (
    <div className="nb-prob-bar">
      <div className="nb-prob-home" style={{ width: `${pHome}%` }} />
      {hasDraws && pDraw > 0 && <div className="nb-prob-draw" style={{ width: `${pDraw}%` }} />}
      <div className="nb-prob-away" style={{ width: `${pAway}%` }} />
    </div>
  );
}

function MatchRow({ match, teamA, teamB, league, hasDraws, isPast, onSelect }) {
  const { pHome, pDraw, pAway } = useMemo(
    () => predictOutcome(teamA.rating, teamB.rating, hasDraws),
    [teamA, teamB, hasDraws]
  );

  const hasResult = !!match.result;
  const predictedPick = pickFromProbabilities(pHome, pDraw, pAway);

  return (
    <div className="nb-row" onClick={() => onSelect(match)}>
      <div className="nb-row-time">{match.time}</div>

      <div className="nb-row-match">
        <div className="nb-row-teams">
          {teamA.name} <span className="vs">vs</span> {teamB.name}
        </div>
        <div className="nb-row-league">{league?.label ?? match.league}</div>
      </div>

      {hasResult ? (
        <>
          <div className="nb-pick-note">
            Predicted: {predictedPick === "home" ? teamA.name : predictedPick === "away" ? teamB.name : "Draw"}
          </div>
          <div className="nb-result-score">
            {match.result.h} - {match.result.a}
          </div>
          <div className={`nb-tag ${predictedPick === pickFromResult(match.result, hasDraws) ? "nb-tag-correct" : "nb-tag-missed"}`}>
            {predictedPick === pickFromResult(match.result, hasDraws) ? "Correct" : "Missed"}
          </div>
        </>
      ) : isPast ? (
        <>
          <div className="nb-pick-note">No result recorded</div>
          <div className="nb-result-score">—</div>
          <div className="nb-tag">—</div>
        </>
      ) : (
        <>
          <ProbBar pHome={pHome} pDraw={pDraw} pAway={pAway} hasDraws={hasDraws} />
          <div className="nb-row-pct">
            {hasDraws ? `${pHome}-${pDraw}-${pAway}` : `${pHome}-${pAway}`}
          </div>
          <div className="nb-row-score">{predictScoreline(pHome, pDraw, pAway)}</div>
        </>
      )}
    </div>
  );
}

export default function MatchesList() {
  const navigate = useNavigate();
  const todayStr = dateStrForOffset(0);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [sportFilter, setSportFilter] = useState("all");

  const [sports, setSports] = useState(null);
  const [leagues, setLeagues] = useState(null);
  const [matches, setMatches] = useState([]);
  const [teamsById, setTeamsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadStaticData() {
      try {
        const [sportsData, leaguesData] = await Promise.all([fetchSports(), fetchAllLeagues()]);
        setSports(sportsData);
        setLeagues(leaguesData);
      } catch (err) {
        setError("Could not load sports/leagues data.");
        console.error(err);
      }
    }
    loadStaticData();
  }, []);

  useEffect(() => {
    async function loadMatches() {
      setLoading(true);
      setError(null);
      try {
        const matchDocs = await fetchMatchesForDate(selectedDate, sportFilter);
        setMatches(matchDocs);

        const teamIds = new Set();
        matchDocs.forEach((m) => {
          teamIds.add(m.teamA);
          teamIds.add(m.teamB);
        });
        const teams = await fetchTeamsByIds([...teamIds]);
        setTeamsById(teams);
      } catch (err) {
        setError("Could not load matches. Check your connection and Firestore rules.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadMatches();
  }, [selectedDate, sportFilter]);

  function handleSelectMatch(match) {
    navigate(`/match/${match.sport}/${match.league}/${match.teamA}/${match.teamB}`);
  }

  function handleDayTabClick(offset) {
    setSelectedDate(dateStrForOffset(offset));
  }

  function handleDatePick(e) {
    if (e.target.value) setSelectedDate(e.target.value);
  }

  const grouped = matches.reduce((acc, m) => {
    const key = `${m.sport}-${m.league}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const dataReady = sports && leagues;
  const isPast = selectedDate < todayStr;
  const isQuickRangeDate = DAY_OFFSETS.some((o) => dateStrForOffset(o) === selectedDate);

  return (
    <div className="nb-page">
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />

      <div className="nb-container">
        <div className="nb-header">
          <img src={logo} alt="Netbet logo" className="nb-logo" />
          <span className="nb-title">NETBET</span>
        </div>

        <div className="nb-tab-row">
          {DAY_OFFSETS.map((offset) => {
            const dateForTab = dateStrForOffset(offset);
            return (
              <button
                key={offset}
                onClick={() => handleDayTabClick(offset)}
                className={`nb-tab ${dateForTab === selectedDate ? "active-amber" : ""}`}
              >
                {labelForDate(dateForTab)}
              </button>
            );
          })}
        </div>

        <div className="nb-date-row">
          <span className="nb-date-label">Or browse any date:</span>
          <input
            type="date"
            className="nb-date-input"
            value={isQuickRangeDate ? "" : selectedDate}
            max={todayStr}
            onChange={handleDatePick}
          />
          {!isQuickRangeDate && (
            <span className="nb-date-label">Showing {labelForDate(selectedDate)}</span>
          )}
        </div>

        {dataReady && (
          <div className="nb-sport-row">
            {["all", ...Object.keys(sports)].map((key) => {
              const label = key === "all" ? "All sports" : sports[key].label;
              return (
                <button
                  key={key}
                  onClick={() => setSportFilter(key)}
                  className={`nb-tab-sm ${key === sportFilter ? "active-cyan" : ""}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <div className="nb-table-head">
          <div className="nb-col-time">Time</div>
          <div className="nb-col-match">Match</div>
          {isPast ? (
            <>
              <div className="nb-col-center90">Prediction</div>
              <div className="nb-col-pct">Result</div>
              <div className="nb-col-pred">Status</div>
            </>
          ) : (
            <>
              <div className="nb-col-prob">Prob.</div>
              <div className="nb-col-pct">1X2 %</div>
              <div className="nb-col-pred">Pred</div>
            </>
          )}
        </div>

        <div className="nb-table">
          {error ? (
            <div className="nb-empty">{error}</div>
          ) : loading || !dataReady ? (
            <div className="nb-empty">Loading matches…</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="nb-empty">No fixtures for this date</div>
          ) : (
            Object.entries(grouped).map(([key, matchGroup]) => {
              const [sportKey, leagueKey] = key.split("-");
              const league = leagues[leagueKey];
              const hasDraws = sports[sportKey]?.hasDraws ?? false;
              return (
                <div key={key}>
                  <div className="nb-league-header">
                    {sports[sportKey]?.label ?? sportKey} — {league?.label ?? leagueKey} ({league?.country ?? "—"})
                  </div>
                  {matchGroup.map((m) => {
                    const teamA = teamsById[m.teamA];
                    const teamB = teamsById[m.teamB];
                    if (!teamA || !teamB) return null;
                    return (
                      <MatchRow
                        key={m.id}
                        match={m}
                        teamA={teamA}
                        teamB={teamB}
                        league={league}
                        hasDraws={hasDraws}
                        isPast={isPast}
                        onSelect={handleSelectMatch}
                      />
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="nb-footnote">
          {isPast
            ? "Past results shown alongside what the model predicted beforehand"
            : "Predictions generated from power ratings, recent form, and head-to-head history"}
        </div>
      </div>
    </div>
  );
}