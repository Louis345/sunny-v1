import { useSession } from "./hooks/useSession";
import { ChildPicker } from "./components/ChildPicker";
import { SessionScreen } from "./components/SessionScreen";
import { SessionEnd } from "./components/SessionEnd";

function App() {
  const { state, startSession, bargeIn, endSession, resetToPicker } =
    useSession();

  if (state.phase === "picker") {
    return (
      <div className="w-screen h-screen overflow-hidden">
        {state.error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm z-10">
            {state.error}
          </div>
        )}
        <ChildPicker onSelect={startSession} />
      </div>
    );
  }

  if (state.phase === "connecting") {
    return (
      <div className="w-screen h-screen overflow-hidden flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-pulse text-2xl mb-2">🌟</div>
          <p className="text-gray-600">Connecting...</p>
        </div>
      </div>
    );
  }

  if (state.phase === "active") {
    return (
      <div className="w-screen h-screen overflow-hidden">
        <SessionScreen
          childName={state.childName ?? ""}
          companion={state.companion}
          companionText={state.companionText}
          interimTranscript={state.interimTranscript}
          correctStreak={state.correctStreak}
          canvas={state.canvas}
          reward={state.reward}
          sessionPhase={state.sessionPhase}
          onBargeIn={bargeIn}
          onEndSession={endSession}
        />
      </div>
    );
  }

  if (state.phase === "ended") {
    return (
      <div className="w-screen h-screen overflow-hidden">
        <SessionEnd
          onReturn={resetToPicker}
          childName={state.childName}
          companionName={state.companion?.companionName}
        />
      </div>
    );
  }

  return null;
}

export default App;
