import { describe, expect, mock, test } from "bun:test";
import React from "react";
import type { AIModel } from "@/services/ai/models";

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

const MockView: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("View", props, props.children as React.ReactNode);

const MockText: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("Text", props, props.children as React.ReactNode);

const MockTextInput: React.FC<Record<string, unknown>> = (props) =>
  React.createElement("TextInput", props, props.children as React.ReactNode);

const MockActivityIndicator: React.FC<Record<string, unknown>> = (props) =>
  React.createElement(
    "ActivityIndicator",
    props,
    props.children as React.ReactNode,
  );

const MockFlatList: React.FC<Record<string, unknown>> = (props) => {
  const data = (props.data as unknown[]) || [];
  const renderItem = props.renderItem as (info: {
    item: unknown;
    index: number;
  }) => React.ReactNode;
  return React.createElement(
    "FlatList",
    props,
    data.map((item, index) =>
      React.createElement(
        React.Fragment,
        {
          key:
            (props.keyExtractor as (item: unknown) => string)?.(item) ?? index,
        },
        renderItem({ item, index }),
      ),
    ),
  );
};

// Mock react-native and dependencies for the Bun test environment
mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
  },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: unknown) =>
      Array.isArray(style) ? Object.assign({}, ...style) : style || {},
    hairlineWidth: 1,
    absoluteFill: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    absoluteFillObject: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
  },
  View: MockView,
  Text: MockText,
  TextInput: MockTextInput,
  ActivityIndicator: MockActivityIndicator,
  FlatList: MockFlatList,
  Pressable: MockView,
  Touchable: { Mixin: {} },
  useColorScheme: () => "dark",
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
}));

mock.module("lucide-react-native", () => ({
  Check: MockView,
  RefreshCw: MockView,
  Search: MockView,
  ChevronDown: MockView,
  Flag: MockView,
  Mic: MockView,
  Minus: MockView,
  Plus: MockView,
  Repeat2: MockView,
  X: MockView,
  Clock: MockView,
  Sparkles: MockView,
  Trash2: MockView,
  ArrowUp: MockView,
}));

mock.module("@expo/ui/community/bottom-sheet", () => ({
  BottomSheet: (props: Record<string, unknown>) =>
    React.createElement(
      "BottomSheet",
      props,
      props.children as React.ReactNode,
    ),
}));

mock.module("@/theme/useResolvedTheme", () => ({
  useIsDark: () => true,
  useResolvedTheme: () => "dark",
}));

mock.module("./AnimatedPressable", () => ({
  AnimatedPressable: (props: Record<string, unknown>) =>
    React.createElement("Pressable", props, props.children as React.ReactNode),
}));

// Sample mock models
const mockModels: AIModel[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    contextLength: 200000,
    availability: "available",
    capabilities: {
      textInput: true,
      textOutput: true,
      tools: true,
      toolChoice: true,
      streaming: true,
      structuredOutputs: true,
      compatibility: "FULL_AGENT",
    },
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    contextLength: 128000,
    availability: "available",
    capabilities: {
      textInput: true,
      textOutput: true,
      tools: true,
      toolChoice: true,
      streaming: true,
      structuredOutputs: true,
      compatibility: "FULL_AGENT",
    },
  },
  {
    id: "meta-llama/llama-3-8b-instruct",
    name: "Llama 3 8B Instruct",
    provider: "Meta",
    contextLength: 8192,
    availability: "available",
    capabilities: {
      textInput: true,
      textOutput: true,
      tools: false,
      toolChoice: false,
      streaming: true,
      structuredOutputs: false,
      compatibility: "CONVERSATION_ONLY",
    },
  },
  {
    id: "mistralai/mistral-large-unavailable",
    name: "Mistral Large Unavailable",
    provider: "Mistral",
    contextLength: 32000,
    availability: "unavailable",
    capabilities: {
      textInput: true,
      textOutput: true,
      tools: true,
      toolChoice: true,
      streaming: true,
      structuredOutputs: true,
      compatibility: "FULL_AGENT",
    },
  },
];

const { ModelCatalogSheet } = await import("./ModelCatalogSheet");
const ReactTestRenderer = (await import("react-test-renderer")).default;
const { act } = await import("react-test-renderer");

describe("ModelCatalogSheet native-first presentation", () => {
  test("renders in Sheet with native bottom-sheet without React Native Modal", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={mockModels}
          loading={false}
          error={null}
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    // BottomSheet should be present
    const bottomSheet = root.findByType("BottomSheet");
    expect(bottomSheet).toBeDefined();
    expect(bottomSheet.props.index).toBe(0);

    // No React Native Modal is used
    expect(root.findAllByType("Modal").length).toBe(0);
  });

  test("filters models by search query", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={mockModels}
          loading={false}
          error={null}
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    const textInput = root.findByType("TextInput");
    expect(textInput).toBeDefined();

    // Type query "gpt"
    act(() => {
      textInput.props.onChangeText("gpt");
    });

    // Should find GPT-4o
    const gptModel = root.findByProps({
      accessibilityLabel: "GPT-4o, OpenAI, 128k context, Agent-Ready",
    });
    expect(gptModel).toBeDefined();

    // Should not find Claude 3.5 Sonnet in filtered items
    expect(
      root.findAllByProps({
        accessibilityLabel:
          "Claude 3.5 Sonnet, Anthropic, 200k context, Agent-Ready",
      }).length,
    ).toBe(0);
  });

  test("shows empty state when search matches no models", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={mockModels}
          loading={false}
          error={null}
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    const textInput = root.findByType("TextInput");

    act(() => {
      textInput.props.onChangeText("nonexistent-model-xyz");
    });

    // Should show no models match text
    const emptyTextNodes = root.findAll((node) => {
      const children = Array.isArray(node.props?.children)
        ? node.props.children.join("")
        : String(node.props?.children || "");
      return children.includes("No models match");
    });
    expect(emptyTextNodes.length).toBeGreaterThan(0);
  });

  test("handles loading state with ActivityIndicator", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={[]}
          loading={true}
          error={null}
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    const loader = root.findByType("ActivityIndicator");
    expect(loader).toBeDefined();
  });

  test("handles error state with error text", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={[]}
          loading={false}
          error="Network error fetching models"
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    const errorNodes = root.findAll(
      (node) => node.props?.children === "Network error fetching models",
    );
    expect(errorNodes.length).toBeGreaterThan(0);
  });

  test("selects agent-capable model and triggers selection and close callbacks", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={mockModels}
          loading={false}
          error={null}
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    const gptModel = root.findByProps({
      accessibilityLabel: "GPT-4o, OpenAI, 128k context, Agent-Ready",
    });
    expect(gptModel).toBeDefined();

    act(() => {
      gptModel.props.onPress();
    });

    expect(onSelectModel).toHaveBeenCalledTimes(1);
    expect(onSelectModel).toHaveBeenCalledWith("openai/gpt-4o");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("does not select disabled model without tool support", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={mockModels}
          loading={false}
          error={null}
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    const llamaModel = root.findByProps({
      accessibilityLabel:
        "Llama 3 8B Instruct, Meta, 8k context, No Tool Support",
    });
    expect(llamaModel).toBeDefined();
    expect(llamaModel.props.accessibilityState.disabled).toBe(true);

    act(() => {
      llamaModel.props.onPress();
    });

    expect(onSelectModel).toHaveBeenCalledTimes(0);
    expect(onClose).toHaveBeenCalledTimes(0);
  });

  test("triggers onRefresh callback from header action", () => {
    const onClose = mock(() => {});
    const onSelectModel = mock((_id: string) => {});
    const onRefresh = mock(() => {});

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ModelCatalogSheet
          visible={true}
          onClose={onClose}
          models={mockModels}
          loading={false}
          error={null}
          selectedModelId="anthropic/claude-3.5-sonnet"
          onSelectModel={onSelectModel}
          onRefresh={onRefresh}
        />,
      );
    });

    const root = renderer!.root;
    const refreshBtn = root.findByProps({
      accessibilityLabel: "Force refresh model catalog",
    });
    expect(refreshBtn).toBeDefined();

    act(() => {
      refreshBtn.props.onPress();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
