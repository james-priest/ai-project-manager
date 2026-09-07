export type ViewportSize = {
  width: number;
  height: number;
};

export type AssistantGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const ASSISTANT_MARGIN = 24;
export const ASSISTANT_MIN_WIDTH = 320;
export const ASSISTANT_MIN_HEIGHT = 360;
export const ASSISTANT_MAX_WIDTH = 560;
export const ASSISTANT_MAX_HEIGHT = 720;
export const ASSISTANT_DEFAULT_WIDTH = 400;
export const ASSISTANT_DEFAULT_HEIGHT = 540;

type GeometryBounds = {
  marginX: number;
  marginY: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const getGeometryBounds = (viewport: ViewportSize): GeometryBounds => {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const marginX = Math.min(ASSISTANT_MARGIN, width / 2);
  const marginY = Math.min(ASSISTANT_MARGIN, height / 2);
  const availableWidth = Math.max(1, width - marginX * 2);
  const availableHeight = Math.max(1, height - marginY * 2);

  return {
    marginX,
    marginY,
    minWidth: Math.min(ASSISTANT_MIN_WIDTH, availableWidth),
    maxWidth: Math.min(ASSISTANT_MAX_WIDTH, availableWidth),
    minHeight: Math.min(ASSISTANT_MIN_HEIGHT, availableHeight),
    maxHeight: Math.min(ASSISTANT_MAX_HEIGHT, availableHeight),
  };
};

export const getInitialAssistantGeometry = (
  viewport: ViewportSize
): AssistantGeometry => {
  const bounds = getGeometryBounds(viewport);
  const width = clamp(
    ASSISTANT_DEFAULT_WIDTH,
    bounds.minWidth,
    bounds.maxWidth
  );
  const height = clamp(
    ASSISTANT_DEFAULT_HEIGHT,
    bounds.minHeight,
    bounds.maxHeight
  );

  return {
    x: Math.max(bounds.marginX, viewport.width - bounds.marginX - width),
    y: Math.max(bounds.marginY, viewport.height - bounds.marginY - height),
    width,
    height,
  };
};

export const clampAssistantGeometry = (
  geometry: AssistantGeometry,
  viewport: ViewportSize
): AssistantGeometry => {
  const bounds = getGeometryBounds(viewport);
  const width = clamp(geometry.width, bounds.minWidth, bounds.maxWidth);
  const height = clamp(geometry.height, bounds.minHeight, bounds.maxHeight);
  const maxX = Math.max(bounds.marginX, viewport.width - bounds.marginX - width);
  const maxY = Math.max(bounds.marginY, viewport.height - bounds.marginY - height);

  return {
    x: clamp(geometry.x, bounds.marginX, maxX),
    y: clamp(geometry.y, bounds.marginY, maxY),
    width,
    height,
  };
};

export const moveAssistantGeometry = (
  geometry: AssistantGeometry,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize
) =>
  clampAssistantGeometry(
    { ...geometry, x: geometry.x + deltaX, y: geometry.y + deltaY },
    viewport
  );

export const resizeAssistantGeometry = (
  geometry: AssistantGeometry,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize
) =>
  clampAssistantGeometry(
    {
      ...geometry,
      width: geometry.width + deltaX,
      height: geometry.height + deltaY,
    },
    viewport
  );
