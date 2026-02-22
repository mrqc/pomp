
export class InternalLogger {
    private name: string;
    
    constructor(name: string) {
        this.name = name.replace(process.cwd() + '/', "");
    }
    public info(message: string) {
        console.log("[" + this.name + "] " + message);
    }
    
    public error(message: string) {
        console.log("[" + this.name + "] " + message);
    }

    public debug(message: string) {
        console.log("[" + this.name + "] " + message);
    }
}
