import re
with open('firestore.rules', 'r') as f:
    content = f.read()

# Make users readable by anyone authenticated (so chats can be initiated)
content = re.sub(
    r"match /users/\{uid\} \{[\s\S]*?allow read, update, delete: if isOwner\(uid\) \|\| isAdmin\(\);",
    r"match /users/{uid} {\n      allow read: if isAuthenticated();\n      allow update, delete: if isOwner(uid) || isAdmin();",
    content
)

# Simplify conversations and messages
content = re.sub(
    r"    // Conversations and Messages[\s\S]*?    // Analytics",
    r"""    // Conversations and Messages
    // ===============================================================
    match /conversations/{conversationId} {
      allow read, write: if isAuthenticated() && (
        isAdmin() ||
        (resource == null && request.resource != null && request.auth.uid in request.resource.data.participant_ids) ||
        (resource != null && request.auth.uid in resource.data.participant_ids)
      );
      
      match /messages/{messageId} {
        allow read, write: if isAuthenticated() && (
          isAdmin() ||
          (get(/databases/$(database)/documents/conversations/$(conversationId)).data.participant_ids.hasAny([request.auth.uid]))
        );
      }
      
      match /members/{userId} {
        allow read, write: if isAuthenticated() && (
          isAdmin() ||
          (get(/databases/$(database)/documents/conversations/$(conversationId)).data.participant_ids.hasAny([request.auth.uid]))
        );
      }
    }

    // ===============================================================
    // Analytics""",
    content
)

with open('firestore.rules', 'w') as f:
    f.write(content)
