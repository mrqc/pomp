---
name: whatsapp
description: Retrieve or write messages via WhatsApp.
disableModelInvocation: false
---
# WhatsApp Skill
Retrieving messages from a contact or sending a new message to a contact via WhatsApp.

## Steps
1. To retrieve messages, execute the following command:
```bash
npm run whatsapp retrieve <contact>
```
The contact name must be provided as an argument.

2. To write a message, execute the following command:
```bash
npm run whatsapp write <contact> <message>
```
The contact name and the message content must be provided as arguments.
