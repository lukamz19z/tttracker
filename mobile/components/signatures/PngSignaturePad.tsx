import { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { File } from "expo-file-system";

type Point = { x: number; y: number };
type Stroke = Point[];

export function PngSignaturePad({
  onChange,
  disabled = false,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const captureTarget = useRef<View>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStroke = useRef<Stroke>([]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => {
          currentStroke.current = [
            {
              x: event.nativeEvent.locationX,
              y: event.nativeEvent.locationY,
            },
          ];
          setStrokes((current) => [...current, currentStroke.current]);
        },
        onPanResponderMove: (event) => {
          const point = {
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY,
          };
          currentStroke.current = [...currentStroke.current, point];
          setStrokes((current) => [
            ...current.slice(0, -1),
            currentStroke.current,
          ]);
        },
        onPanResponderRelease: () => {
          void exportSignature();
        },
      }),
    [disabled, strokes],
  );

  async function exportSignature() {
    if (!captureTarget.current || strokes.length === 0) {
      onChange(null);
      return;
    }
    const uri = await captureRef(captureTarget, {
      format: "png",
      quality: 0.9,
      result: "tmpfile",
    });
    const base64 = await new File(uri).base64();
    onChange(`data:image/png;base64,${base64}`);
  }

  function clear() {
    currentStroke.current = [];
    setStrokes([]);
    onChange(null);
  }

  return (
    <View>
      <View
        ref={captureTarget}
        collapsable={false}
        style={styles.pad}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height="100%">
          {strokes.map((stroke, index) => (
            <Polyline
              key={index}
              points={stroke.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#0f172a"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        {strokes.length === 0 ? (
          <View pointerEvents="none" style={styles.placeholder}>
            <Text style={styles.placeholderText}>Sign here</Text>
          </View>
        ) : null}
      </View>
      <Pressable disabled={disabled} onPress={clear} style={styles.clear}>
        <Text style={styles.clearText}>Clear signature</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    height: 180,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "#94a3b8", fontWeight: "700" },
  clear: { alignSelf: "flex-end", paddingVertical: 10 },
  clearText: { color: "#b91c1c", fontWeight: "800", fontSize: 13 },
});
