import { BrowserRouter, Routes, Route } from "react-router-dom";
import MatchesList from "./components/MatchesList";
import PredictionUI from "./components/PredictionUI";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MatchesList />} />
        <Route path="/match/:sport/:league/:teamA/:teamB" element={<PredictionUI />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;