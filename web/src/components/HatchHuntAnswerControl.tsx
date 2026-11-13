import { useState, type FormEvent, type ReactElement } from "react";

export function HatchHuntAnswerControl({
  mode = "selection",
  answers,
  onAnswer,
}: {
  mode?: "selection" | "numeric" | "text";
  answers: string[];
  onAnswer: (answer: string) => void;
}): ReactElement {
  const [value, setValue] = useState("");

  if (mode === "selection") {
    return (
      <div className="hatch-hunt-answer-control hatch-hunt-answer-control--choices">
        {answers.map((answer) => (
          <button type="button" key={answer} onClick={() => onAnswer(answer)}>{answer}</button>
        ))}
      </div>
    );
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const answer = value.trim();
    if (!answer) return;
    onAnswer(answer);
  }

  return (
    <form className="hatch-hunt-answer-control hatch-hunt-answer-control--entry" onSubmit={submit}>
      <label>
        <span>{mode === "numeric" ? "Your number" : "Your answer"}</span>
        <input
          aria-label={mode === "numeric" ? "Your number" : "Your answer"}
          inputMode={mode === "numeric" ? "decimal" : "text"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
        />
      </label>
      <button type="submit" disabled={!value.trim()}>Lock it in</button>
    </form>
  );
}
