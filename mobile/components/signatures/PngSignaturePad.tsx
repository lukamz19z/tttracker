import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, type GestureResponderEvent, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { File } from "expo-file-system";

type Point = { x: number; y: number };
type Stroke = Point[];

export function PngSignaturePad({ onChange, disabled = false, onSigningChange }: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  onSigningChange?: (signing: boolean) => void;
}) {
  const captureTarget = useRef<View>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [revision, setRevision] = useState(0);
  const strokesRef = useRef<Stroke[]>([]);
  const active = useRef(false);
  const version = useRef(0);
  const callbacks = useRef({ onChange, onSigningChange, disabled });
  callbacks.current = { onChange, onSigningChange, disabled };
  const publish = () => setStrokes(strokesRef.current.map((stroke) => [...stroke]));
  const append = (event: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = event.nativeEvent;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const stroke = strokesRef.current.at(-1);
    if (stroke && (stroke.at(-1)?.x !== x || stroke.at(-1)?.y !== y)) stroke.push({ x, y });
  };
  const finish = (event: GestureResponderEvent) => {
    if (!active.current) return;
    append(event);
    active.current = false;
    publish();
    setRevision(++version.current);
  };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !callbacks.current.disabled,
    onStartShouldSetPanResponderCapture: () => !callbacks.current.disabled,
    onMoveShouldSetPanResponder: () => !callbacks.current.disabled,
    onMoveShouldSetPanResponderCapture: () => !callbacks.current.disabled,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (event) => {
      ++version.current;
      active.current = true;
      callbacks.current.onSigningChange?.(true);
      callbacks.current.onChange(null);
      strokesRef.current.push([]);
      append(event);
      publish();
    },
    onPanResponderMove: (event) => { if (active.current) { append(event); publish(); } },
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
    // All mutable inputs live in refs; this responder owns a whole stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => {
    if (!revision || active.current || !strokesRef.current.length) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      // Effect follows React commit; another frame allows native SVG painting.
      requestAnimationFrame(() => {
        if (cancelled || version.current !== revision || active.current) return;
        void (async () => {
          try {
            const uri = await captureRef(captureTarget, { format: "png", quality: 1, result: "tmpfile" });
            const file = new File(uri);
            const base64 = await file.base64();
            file.delete();
            if (!cancelled && version.current === revision && !active.current) callbacks.current.onChange(`data:image/png;base64,${base64}`);
          } catch {
            if (!cancelled && version.current === revision) {
              callbacks.current.onChange(null);
              Alert.alert("Signature could not be captured", "Please draw your signature again before submitting.");
            }
          } finally {
            if (!cancelled && version.current === revision) callbacks.current.onSigningChange?.(false);
          }
        })();
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [revision]);
  useEffect(() => () => { callbacks.current.onSigningChange?.(false); }, []);

  function clear() {
    ++version.current;
    active.current = false;
    strokesRef.current = [];
    setStrokes([]);
    callbacks.current.onChange(null);
    callbacks.current.onSigningChange?.(false);
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
            stroke.length === 1 ? <Circle key={index} cx={stroke[0].x} cy={stroke[0].y} r={1.1} fill="#0f172a" /> : <Polyline
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
  clear: { minHeight: 44, minWidth: 44, alignSelf: "flex-end", paddingVertical: 10 },
  clearText: { color: "#b91c1c", fontWeight: "800", fontSize: 13 },
});
