import {StateHandler} from "./state_handler";
import {MessageListener, SocketSession} from "../messaging/comms";
import * as messages from "../../../data/messages";
import {Message} from "../../../data/messages";
import {ServerErrorWithCause} from "../../../data/result";
import {a} from "../../util/tags";

export interface SocketState {
    status: "connected" | "disconnected",
    errors: ServerErrorWithCause[]
}

// export interface ISocket {
//     url: {href: string},
//     // TODO: is there a more clever way to handle these delegates?
//     addMessageListener(...args: Parameters<SocketSession["addMessageListener"]>): ReturnType<SocketSession["addMessageListener"]>
//     addEventListener(...args: Parameters<SocketSession["addEventListener"]>): ReturnType<SocketSession["addEventListener"]>
//     send(...args: Parameters<SocketSession["send"]>): ReturnType<SocketSession["send"]>
//     reconnect(...args: Parameters<SocketSession["reconnect"]>): ReturnType<SocketSession["reconnect"]>
//     close(...args: Parameters<SocketSession["close"]>): ReturnType<SocketSession["close"]>
// }

/**
 * SocketStateHandler manages a Socket. It does not hold a reference to the socket, instead pushing it to the Sockets global map.
 */
export class SocketStateHandler extends StateHandler<SocketState> {

    private readonly socketKey: string;
    private static inst: SocketStateHandler;

    static get global() {
        if (!SocketStateHandler.inst) {
            SocketStateHandler.inst = new SocketStateHandler(SocketSession.global)
        }
        return SocketStateHandler.inst;
    }

    constructor(socket: SocketSession, initial: SocketState = {status: "disconnected", errors: []}) {
        super(initial);

        this.socketKey = socket.url.href;
        Sockets.set(this.socketKey, socket);

        socket.addEventListener('open', evt => {
            this.updateState(s => {
                s.status = "connected";
                return s
            })
        });

        socket.addEventListener('close', evt => {
            this.updateState(s => {
                s.status = "disconnected";
                return s
            })
        });
        socket.addEventListener('error', evt => {
            const url = new URL(socket.url.toString());
            url.protocol = document.location.protocol;
            const req = new XMLHttpRequest();
            req.responseType = "arraybuffer";
            req.addEventListener("readystatechange", evt => {
                if (req.readyState == 4) {
                    if (req.response instanceof ArrayBuffer && req.response.byteLength > 0) {
                        const msg = Message.decode(req.response);
                        if (msg instanceof messages.Error) {
                            socket.close();
                            this.updateState(s => {
                                s.errors.push(msg.error);
                                s.status = "disconnected";
                                return s
                            })
                        }
                    }
                }
            });
            req.open("GET", url.toString());
            req.send(null);
        });
    }

    get socket() {
        const socket = Sockets.get(this.socketKey);
        if (socket) return socket;
        else throw new Error(`Unable to find socket with key ${this.socketKey}`);
    }
    // delegates
    public addMessageListener(...args: Parameters<SocketSession["addMessageListener"]>): ReturnType<SocketSession["addMessageListener"]> {
        return this.socket.addMessageListener(...args)
    }
    public send(...args: Parameters<SocketSession["send"]>): ReturnType<SocketSession["send"]> {
        return this.socket.send(...args)
    }
    public reconnect(...args: Parameters<SocketSession["reconnect"]>): ReturnType<SocketSession["reconnect"]> {
        return this.socket.reconnect(...args)
    }
}

/**
 * Singleton class holding references to all the sockets. This is a bit ugly, we need this in order to prevent the State
 * from including Sockets which are uncloneable.
 */
export const Sockets = new Map<string, SocketSession>();