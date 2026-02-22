# POMP — Voice Dialog Personal Assistant

*POMP* is a headless (first) assistant run by voice. It is my vision of the future interaction with AI agents.
POMP is there without seeing it. There is (at first) no GUI but controlled by your voice. This headless approach
is an enabler to integrate AI seamless into our daily life. We have to rethink our interaction with computers.
Maybe the future integration of software systems/AI was already defined in Start Trek, Star Wars and other Science
Fiction. We already have all tools available. We only have to put it together. With POMP this is my start. My vision
is that POMP is going to be used not only on our workplace but also when we walk through our apartments and houses,
when we sit in the car and when go to the groceries and we do not see it. Everywhere you can speak to it. In the future POMP is going
to "see" you via camera and also see what you are doing on the screen.

The features for now:
- Speach recognition based on a local model (no recording leaves your environment), so you can run it 24h (STT)
- The AI already can talk to you ("Hey buddy, what's the time?" - "It is monday, XX:XX") via a local model (so the
  text generate for speech - different to the LLM result - is not leaving your computer)
- Configuration for different LLMs and other parameters of your choice (OpenAI, Gemini, ...)
- Viewing the current session
- Viewing the current speech transcription context window (text currently transcribed)

For now POMP supports voice and you are free to install new skills you admire. The supported language for now
is english. There is a configuration UI available. Near future steps are: 
- STT via stream (currently via chunking)
- More Skill Support
- More Input Stream Support (Messages like WhatsApp, Telegram, Signal, ...)
- UI support for your daily work having insight into results and the AI can demonstrate that to you
- Other languages than english (German next hopefully)
- More interaction possibilities with the AI for different sessions ("Lets proceed with X from yesterday...")
- Camera Vision Support
- Screen Vision Support
- Embedded Systems support to bring POMP to smart homes
