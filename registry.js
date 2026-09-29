// Object type -> class. New object types (including future ecosystem objects) only
// need to be registered here and in core/model.js TYPES.
import { PdfObject } from './pdf.js';
import { VideoObject } from './video.js';
import { ImageObject } from './image.js';
import { TextObject } from './text.js';
import { AudioObject } from './audio.js';
import { FallbackObject } from './fallback.js';
import { NoteObject } from './note.js';
import { CalculatorObject } from './calculator.js';
import { PomodoroObject } from './pomodoro.js';
import { DabsyObject } from './dabsy.js';
import { SolveCountObject } from './solvecount.js';

export const REGISTRY = {
  pdf: PdfObject, video: VideoObject, image: ImageObject, text: TextObject, audio: AudioObject,
  file: FallbackObject, note: NoteObject, calculator: CalculatorObject, pomodoro: PomodoroObject,
  dabsy: DabsyObject, solvecount: SolveCountObject,
};
