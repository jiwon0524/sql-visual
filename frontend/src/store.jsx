import { useState, useEffect, createContext, useContext } from "react";
import { PROBLEMS } from "./data/problems.js";

const StoreContext = createContext(null);

function loadStorage(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
  catch { return def; }
}
function saveStorage(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export function StoreProvider({ children }) {
  const [solved,   setSolved]   = useState(() => loadStorage("sql_solved", {}));
  const [bookmarks,setBookmarks]= useState(() => loadStorage("sql_bookmarks", []));
  const [recentProbs, setRecentProbs] = useState(() => loadStorage("sql_recent_probs", []));
  const [recentConcepts, setRecentConcepts] = useState(() => loadStorage("sql_recent_concepts", []));
  const [streak,   setStreak]   = useState(() => loadStorage("sql_streak", 0));
  const [darkMode, setDarkMode] = useState(() => loadStorage("sql_dark", false));

  useEffect(() => { saveStorage("sql_solved", solved); }, [solved]);
  useEffect(() => { saveStorage("sql_bookmarks", bookmarks); }, [bookmarks]);
  useEffect(() => { saveStorage("sql_recent_probs", recentProbs); }, [recentProbs]);
  useEffect(() => { saveStorage("sql_recent_concepts", recentConcepts); }, [recentConcepts]);
  useEffect(() => { saveStorage("sql_dark", darkMode); }, [darkMode]);

  const markSolved = (id, correct) => {
    setSolved(prev => ({
      ...prev,
      [id]: { correct, attempts: (prev[id]?.attempts || 0) + 1, solvedAt: new Date().toISOString() }
    }));
  };

  const toggleBookmark = (id) => {
    setBookmarks(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  const addRecentProb = (id) => {
    setRecentProbs(prev => [id, ...prev.filter(p => p !== id)].slice(0, 10));
  };

  const addRecentConcept = (id) => {
    setRecentConcepts(prev => [id, ...prev.filter(c => c !== id)].slice(0, 10));
  };

  const totalSolved   = Object.values(solved).filter(v => v.correct).length;
  const totalAttempts = Object.values(solved).reduce((a, v) => a + (v.attempts || 0), 0);
  const accuracy      = totalAttempts > 0 ? Math.round((totalSolved / totalAttempts) * 100) : 0;

  const getStepProgress = (step) => {
    const stepProbs = PROBLEMS.filter(p => p.step === step);
    const done = stepProbs.filter(p => solved[p.id]?.correct).length;
    return { total: stepProbs.length, done };
  };

  return (
    <StoreContext.Provider value={{
      solved, markSolved,
      bookmarks, toggleBookmark,
      recentProbs, addRecentProb,
      recentConcepts, addRecentConcept,
      streak, darkMode, setDarkMode,
      totalSolved, totalAttempts, accuracy,
      getStepProgress,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);
