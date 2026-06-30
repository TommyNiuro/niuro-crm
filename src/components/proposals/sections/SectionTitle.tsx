/* Title con icon-box navy/gold (.section-title + .section-icon-box). */
import type { JSX } from "react";

type Props = {
  icon: JSX.Element;
  children: React.ReactNode;
};

export function SectionTitle({ icon, children }: Props) {
  return (
    <div className="section-title">
      <div className="section-icon-box">{icon}</div>
      {children}
    </div>
  );
}
