/**
 * The Issue 9 prompt's three answers, as the user actually reaches them.
 *
 * The hook's decision is covered in `useLocationFormFlow`. What is covered here
 * is the wiring, which is where this kind of feature usually breaks: three
 * buttons, three different outcomes, and one of them — "I moved" — has to open
 * the map as well, because clearing a pin without offering a way to replace it
 * would leave the user holding an unsaveable form.
 */
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";
import { TownChangeModal } from "@/components/location/TownChangeModal";

function render(overrides: Partial<React.ComponentProps<typeof TownChangeModal>> = {}) {
  const props = {
    visible: true,
    currentTown: "Clifton",
    onMoved: jest.fn(),
    onRelabel: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<TownChangeModal {...props} />);
  });
  return { tree, props };
}

const press = (tree: renderer.ReactTestRenderer, testID: string) =>
  act(() => {
    tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.testID === testID)!
      .props.onPress();
  });

describe("the three answers are wired to three different outcomes", () => {
  it("routes 'I've moved house' to onMoved alone", () => {
    const { tree, props } = render();
    press(tree, "town-change-moved");
    expect(props.onMoved).toHaveBeenCalledTimes(1);
    expect(props.onRelabel).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("routes 'the area name is wrong' to onRelabel alone", () => {
    const { tree, props } = render();
    press(tree, "town-change-relabel");
    expect(props.onRelabel).toHaveBeenCalledTimes(1);
    expect(props.onMoved).not.toHaveBeenCalled();
  });

  it("routes Cancel to onCancel, which is the only no-op answer", () => {
    const { tree, props } = render();
    press(tree, "town-change-cancel");
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onMoved).not.toHaveBeenCalled();
    expect(props.onRelabel).not.toHaveBeenCalled();
  });

  it("makes Android back cancel rather than silently pick one", () => {
    const { tree, props } = render();
    act(() => {
      tree.root.findByProps({ transparent: true }).props.onRequestClose();
    });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("the question names the town being left", () => {
  it("quotes the current town when there is one", () => {
    const { tree } = render({ currentTown: "Clifton" });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("Clifton");
  });

  it("still reads as a sentence when the town is blank", () => {
    // Reachable from the free-text path, where `townOther` can be empty.
    const { tree } = render({ currentTown: "" });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("your previous area");
    expect(text).not.toContain('""');
  });
});
