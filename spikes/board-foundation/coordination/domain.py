from dataclasses import dataclass


@dataclass(frozen=True)
class Actor:
    kind: str
    identifier: str

    @classmethod
    def parse(cls, value):
        try:
            kind, identifier = value.split(":", 1)
        except (AttributeError, ValueError) as error:
            raise ValueError("actor must be kind:identifier") from error
        if kind not in {"user", "agent", "framework"} or not identifier:
            raise ValueError("actor must identify a user, agent, or framework actor")
        return cls(kind, identifier)
