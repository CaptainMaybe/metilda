import React, {createRef} from "react";
import {Layer, Line, Rect, Stage} from "react-konva";
import * as Tone from "tone";
import {Encoding} from "tone";
import {Letter} from "../../types/types";
import "./PitchArt.css";
import PitchArtCoordConverter from "./PitchArtCoordConverter";
import PitchArtGeometry from "./PitchArtGeometry";
import {PitchArtWindowConfig, RawPitchValue} from "./types";
import UserPitchView from "./UserPitchView";

interface Props {
    letters: Letter[][];
    width: number;
    height: number;
    minPitch: number;
    maxPitch: number;
    fileName: string;
    manualPitchChange: (index: number, newPitch: number) => void;
    showDynamicContent: boolean;
    showArtDesign: boolean;
    showPitchArtLines: boolean;
    showLargeCircles: boolean;
    showVerticallyCentered: boolean;
    showAccentPitch: boolean;
    showSyllableText: boolean;
    showPrevPitchValueLists: boolean;
    rawPitchValueLists?: RawPitchValue[][];
}

interface State {
    activePlayIndex: number;
}

export interface ColorScheme {
    lineStrokeColor: string;
    praatDotFillColor: string;
    activePlayColor: string;
    manualDotFillColor: string;
}

/**
 * NOTE: There are a number of places throughout this component that
 * have not fully been converted over to TypeScript, these areas
 * are marked with "// @ts-ignore". These are functional parts of
 * the code, they just don't have explicit types yet.
 */
class PitchArtDrawingWindow extends React.Component<Props, State> {
    private readonly innerWidth: number;
    private readonly innerHeight: number;
    private readonly pointDx0: number;
    private readonly pointDy0: number;
    private readonly innerBorderX0: number;
    private readonly innerBorderY0: number;
    private readonly graphWidth: number;
    private readonly borderWidth: number;
    private readonly smallCircleRadius: number;
    private readonly largeCircleRadius: number;
    private readonly circleStrokeWidth: number;
    private readonly accentedCircleRadius: number;
    private readonly pitchArtSoundLengthSeconds: number;
    private readonly fontSize: number;
    private downloadRef = createRef<HTMLAnchorElement>();
    private stageRef = createRef<Stage>();

    constructor(props: Props) {
        super(props);
        this.state = {
            activePlayIndex: -1
        };
        this.saveImage = this.saveImage.bind(this);
        this.playPitchArt = this.playPitchArt.bind(this);
        this.playSound = this.playSound.bind(this);
        this.imageBoundaryClicked = this.imageBoundaryClicked.bind(this);
        this.setPointerEnabled = this.setPointerEnabled.bind(this);

        this.innerWidth = this.props.width * 0.75;
        this.innerHeight = this.props.height * 0.90;
        this.pointDx0 = (this.props.width - this.innerWidth) / 2.0;
        this.pointDy0 = (this.props.height - this.innerHeight) / 2.0;

        this.innerBorderX0 = (this.props.width - this.props.width * 0.999) / 2.0;
        this.innerBorderY0 = (this.props.height - this.props.height * 0.999) / 2.0;

        this.graphWidth = 5;
        this.borderWidth = 15;
        this.smallCircleRadius = 4;
        this.largeCircleRadius = 10;
        this.circleStrokeWidth = 10;
        this.accentedCircleRadius = 30;
        this.pitchArtSoundLengthSeconds = 0.20;
        this.fontSize = 16;
    }

    saveImage() {
        // trip file extension from upload ID
        const fileName = this.props.fileName.split(".")[0] + ".png";

        // follows example from:
        // https://konvajs.github.io/docs/data_and_serialization/Stage_Data_URL.html
        // @ts-ignore (TypeScript doesn't like the toDataURL call below, but it works fine)
        const dataURL = this.stageRef.current!.getStage().toDataURL();
        this.downloadRef.current!.href = dataURL;
        this.downloadRef.current!.download = fileName;
        this.downloadRef.current!.click();
    }

    playPitchArt() {
        if (this.props.letters.length !== 1) {
            return;
        }

        const letters = this.props.letters[0];
        const env = new Tone.AmplitudeEnvelope({
            attack: 0.001,
            decay: 0.001,
            sustain: 0.001,
            release: 0.001
        }).toMaster();

        const filter = new Tone.Filter({type: "highpass", frequency: 50, rolloff: -48}).toMaster();

        // var synth = new window.Tone.Synth().toMaster().chain(filter, env);
        const synth = new Tone.Synth().toMaster().chain(filter, env);

        const tStart = letters.length > 0 ? letters[0].t0 : 0;
        const tEnd = letters.length > 0 ? letters[letters.length - 1].t1 : 0;

        interface PitchArtNote {
            time: number;
            index: number;
            duration: number;
            pitch: number;
        }

        const notes = letters.map(function(item, index) {
                return {
                    time: item.t0 - tStart,
                    duration: item.t1 - item.t0,
                    pitch: item.pitch,
                    index
                } as PitchArtNote;
            }
        );
        notes.push({time: tEnd, duration: 1, pitch: 1, index: -1});
        const controller = this;

        // @ts-ignore
        const midiPart = new Tone.Part(function(time: Encoding.Time, note: PitchArtNote) {
            controller.setState({activePlayIndex: note.index});
            if (note.index !== -1) {
                synth.triggerAttackRelease(note.pitch, note.duration, time);
            }
        }, notes).start();

        Tone.Transport.start();
    }

    playSound(pitch: number) {
        const synth = new Tone.Synth().toMaster();
        synth.triggerAttackRelease(pitch, this.pitchArtSoundLengthSeconds);
    }

    imageBoundaryClicked(coordConverter: PitchArtCoordConverter) {
        const yPos = this.stageRef.current!.getStage().getPointerPosition().y;
        const pitch = coordConverter.rectCoordsToVertValue(yPos);
        this.playSound(pitch);
    }

    setPointerEnabled(isEnabled: boolean) {
        this.stageRef.current!.getStage().container().style.cursor
            = isEnabled ? "pointer" : "default";
    }

    maybeUserPitchView(windowConfig: PitchArtWindowConfig) {
        if (!this.props.rawPitchValueLists || this.props.rawPitchValueLists.length === 0) {
            return;
        }

        const lastIndex = this.props.rawPitchValueLists.length - 1;

        if (!this.props.showPrevPitchValueLists) {
            return (
                <UserPitchView pitchValues={this.props.rawPitchValueLists[lastIndex]}
                               windowConfig={windowConfig}
                               showVerticallyCentered={this.props.showVerticallyCentered}/>);
        }

        const colors: { [key: number]: string } = {
            0: "#003489",
            1: "#008489",
            2: "#0d0d7c"
        };

        return (
            this.props.rawPitchValueLists.map((item: RawPitchValue[], index) =>
                <UserPitchView pitchValues={item}
                               key={"user-pitch-view-" + index}
                               windowConfig={windowConfig}
                               showVerticallyCentered={this.props.showVerticallyCentered}
                               fillColor={index < lastIndex ? colors[index % Object.keys(colors).length] : undefined}
                               opacity={index < lastIndex ? 0.2 : undefined}/>
            )
        );
    }

    colorScheme = (showArtDesign: boolean, letters: Letter[][]): ColorScheme => {
        if (!showArtDesign || letters.length !== 1) {
            return {
                lineStrokeColor: "#497dba",
                praatDotFillColor: "#497dba",
                activePlayColor: "#e8e82e",
                manualDotFillColor: "#af0008"
            };
        }

        let lineStrokeColor = "black";
        let praatDotFillColor = "black";

        const numLetters = letters[0].length;
        const pitches = letters[0].map((item) => item.pitch);
        const maxPitchIndex = pitches.indexOf(Math.max(...pitches));

        // determine color scheme
        switch (numLetters) {
            case 2:
                switch (maxPitchIndex) {
                    case 0:
                        lineStrokeColor = "#272264";
                        praatDotFillColor = "#0ba14a";
                        break;
                    case 1:
                        lineStrokeColor = "#71002b";
                        praatDotFillColor = "#2e3192";
                        break;
                }
                break;
            case 3:
                switch (maxPitchIndex) {
                    case 0:
                        lineStrokeColor = "#92278f";
                        praatDotFillColor = "#000000";
                        break;
                    case 1:
                        lineStrokeColor = "#056839";
                        praatDotFillColor = "#be72b0";
                        break;
                    case 2:
                    default:
                        lineStrokeColor = "#5b4a42";
                        praatDotFillColor = "#166e92";
                }
                break;
            case 4:
                switch (maxPitchIndex) {
                    case 0:
                        lineStrokeColor = "#f1592a";
                        praatDotFillColor = "#12a89d";
                        break;
                    case 1:
                        lineStrokeColor = "#283890";
                        praatDotFillColor = "#8cc63e";
                        break;
                    case 2:
                    default:
                        lineStrokeColor = "#9e1f62";
                        praatDotFillColor = "#f7941d";
                }
                break;
        }

        return {
            lineStrokeColor,
            praatDotFillColor,
            activePlayColor: "#e8e82e",
            manualDotFillColor: "#af0008"
        };
    }

    render() {
        const windowConfig = {
            innerHeight: this.innerHeight,
            innerWidth: this.innerWidth,
            y0: this.pointDy0,
            x0: this.pointDx0,
            dMin: this.props.minPitch,
            dMax: this.props.maxPitch
        };

        const colorScheme = this.colorScheme(this.props.showArtDesign, this.props.letters);
        const coordConverter = new PitchArtCoordConverter(windowConfig);

        return (
            <div>
                <Stage ref={this.stageRef} width={this.props.width} height={this.props.height}>
                    <Layer>
                        <Rect width={this.props.width}
                              height={this.props.height}
                              fill="white"/>
                        <Line points={[this.innerBorderX0, this.innerBorderY0,
                            this.props.width - this.innerBorderX0, this.innerBorderY0,
                            this.props.width - this.innerBorderX0, this.props.height - this.innerBorderY0,
                            this.innerBorderX0, this.props.height - this.innerBorderY0,
                            this.innerBorderX0, this.innerBorderY0]}
                              strokeWidth={this.borderWidth}
                              stroke={colorScheme.lineStrokeColor}
                              onClick={() => this.imageBoundaryClicked(coordConverter)}
                              onMouseEnter={() => this.setPointerEnabled(true)}
                              onMouseLeave={() => this.setPointerEnabled(false)}/>
                    </Layer>
                    <PitchArtGeometry letters={this.props.letters}
                                      windowConfig={windowConfig}
                                      manualPitchChange={this.props.manualPitchChange}
                                      colorScheme={colorScheme}
                                      playSound={this.playSound}
                                      activePlayIndex={
                                          this.props.letters.length === 1 ? this.state.activePlayIndex : -1}
                                      showDynamicContent={this.props.showDynamicContent}
                                      showArtDesign={this.props.showArtDesign}
                                      showPitchArtLines={this.props.showPitchArtLines}
                                      showLargeCircles={this.props.showLargeCircles}
                                      showVerticallyCentered={this.props.showVerticallyCentered}
                                      showAccentPitch={this.props.showAccentPitch}
                                      showSyllableText={this.props.showSyllableText}
                                      showPrevPitchValueLists={this.props.showPrevPitchValueLists}
                                      largeCircleRadius={this.largeCircleRadius}
                                      smallCircleRadius={this.smallCircleRadius}
                                      graphWidth={this.graphWidth}
                                      fontSize={this.fontSize}
                                      circleStrokeWidth={this.circleStrokeWidth}
                                      pitchArtSoundLengthSeconds={this.pitchArtSoundLengthSeconds}
                                      accentedCircleRadius={this.accentedCircleRadius}
                                      setPointerEnabled={this.setPointerEnabled} />
                    {this.maybeUserPitchView(windowConfig)}
                </Stage>
                <a className="hide" ref={this.downloadRef}>
                    Hidden Download Link
                </a>
            </div>
        );
    }
}

export default PitchArtDrawingWindow;