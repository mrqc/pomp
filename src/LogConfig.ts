
export class InternalLogger {
    private readonly name: string;
    
    constructor(name: string) {
        this.name = name.replace(process.cwd() + '/', "");
    }
    public info(message: string) {
        console.log(Date.now() + " [INFO | " + this.name + "] " + message);
    }
    
    public error(message: string) {
        console.log(Date.now() + " [ERROR | " + this.name + "] " + message);
    }

    public debug(message: string) {
        console.log(Date.now() + " [DEBUG | " + this.name + "] " + message);
    }
    
    public static isDebug() {
        return true;
    }
}
