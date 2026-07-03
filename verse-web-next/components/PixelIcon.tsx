const PATHS: Record<string, string> = {
  heart:
    "M2 2h2v1H2zM6 2h2v1H6zM1 3h4v1H1zM5 3h4v1H5zM1 4h8v1H1zM2 5h6v1H2zM3 6h4v1H3zM4 7h2v1H4z",
  flame:
    "M4 1h2v1H4zM3 2h1v1H3zM6 2h1v1H6zM3 3h1v1H3zM7 3h1v1H7zM2 4h1v2H2zM7 4h1v2H7zM3 6h4v1H3zM2 6h1v1H2zM7 6h1v1H7zM3 7h4v1H3z",
  check:
    "M7 2h1v1H7zM6 3h1v1H6zM5 4h1v1H5zM2 4h1v1H2zM4 5h1v1H4zM3 5h1v1H3z",
  play: "M2 1h1v6H2zM3 2h1v4H3zM4 3h1v2H4zM5 4h1v0H5z",
  star:
    "M4 0h1v2H4zM3 2h1v1H3zM5 2h1v1H5zM0 4h2v1H0zM6 4h2v1H6zM2 4h4v1H2zM1 5h6v1H1zM2 6h4v1H2zM1 7h1v1H1zM6 7h1v1H6zM3 7h1v1H3zM5 7h1v1H5z",
};

interface PixelIconProps {
  name: "heart" | "flame" | "check" | "play" | "star";
  size?: number;
  className?: string;
}

export function PixelIcon({ name, size = 12, className }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      className={className}
      style={{ shapeRendering: "crispEdges", flexShrink: 0 }}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
