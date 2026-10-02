import type { ChoiceButton } from "@/types/flow";

export function OptionButtons({ buttons, onChoose }: { buttons: ChoiceButton[]; onChoose: (b: ChoiceButton) => void }) {
  return (
    <div className="options">
      {buttons.map((b) => (
        <button key={b.id} className="option-btn" onClick={() => onChoose(b)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}
