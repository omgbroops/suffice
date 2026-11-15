# ADR 0011: Match menu rounding and accent slider material

Status: proposed
Date: 2026-11-14

Use the existing menu radius minus its inset for menu-item highlights, so the
inner and outer corners follow the same curve without pill-shaped rows. The reasoning
effort fill derives a vertical light-to-dark gradient from the selected --blue
accent token. Give the track the composer's shared shadow/edge treatment and a
subtle inset treatment on the fill; retain thumb geometry and reduced-motion
behavior. No separate theme-specific sizing or new palette is introduced.
