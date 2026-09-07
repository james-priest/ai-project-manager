import {
  ASSISTANT_MAX_HEIGHT,
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_HEIGHT,
  ASSISTANT_MIN_WIDTH,
  clampAssistantGeometry,
  getInitialAssistantGeometry,
  moveAssistantGeometry,
  resizeAssistantGeometry,
} from "@/lib/assistantGeometry";

describe("assistant geometry", () => {
  it("starts in the lower-right corner with the default size", () => {
    expect(getInitialAssistantGeometry({ width: 1440, height: 900 })).toEqual({
      x: 1016,
      y: 336,
      width: 400,
      height: 540,
    });
  });

  it("fits the initial dialog inside a small viewport", () => {
    const geometry = getInitialAssistantGeometry({ width: 360, height: 400 });

    expect(geometry.width).toBe(312);
    expect(geometry.height).toBe(352);
    expect(geometry.x).toBe(24);
    expect(geometry.y).toBe(24);
  });

  it("clamps position and dimensions to the viewport", () => {
    expect(
      clampAssistantGeometry(
        { x: -80, y: 900, width: 900, height: 900 },
        { width: 1000, height: 800 }
      )
    ).toEqual({
      x: 24,
      y: 56,
      width: ASSISTANT_MAX_WIDTH,
      height: ASSISTANT_MAX_HEIGHT,
    });
  });

  it("keeps a moved dialog inside the viewport", () => {
    const startingGeometry = {
      x: 500,
      y: 200,
      width: 400,
      height: 500,
    };

    expect(
      moveAssistantGeometry(startingGeometry, 500, -500, {
        width: 1000,
        height: 800,
      })
    ).toEqual({
      x: 576,
      y: 24,
      width: 400,
      height: 500,
    });
  });

  it("respects minimum dimensions when resizing", () => {
    expect(
      resizeAssistantGeometry(
        { x: 100, y: 100, width: 400, height: 500 },
        -200,
        -200,
        { width: 1000, height: 800 }
      )
    ).toEqual({
      x: 100,
      y: 100,
      width: ASSISTANT_MIN_WIDTH,
      height: ASSISTANT_MIN_HEIGHT,
    });
  });
});
