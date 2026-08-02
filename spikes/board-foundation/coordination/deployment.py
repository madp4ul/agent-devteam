import os
import urllib.error
import urllib.request
from pathlib import Path


def deployment_capabilities():
    repository = Path(os.environ.get("PROJECT_REPOSITORY_PATH", "/coordination/mounts/project"))
    workspaces = Path(os.environ.get("TASK_WORKSPACES_PATH", "/coordination/mounts/workspaces"))
    codex_home = Path(os.environ.get("CODEX_HOME_PATH", "/coordination/mounts/codex"))
    endpoint = os.environ.get("PROJECT_CONTAINER_ENDPOINT", "http://project-tool:8090")
    reachable = False
    try:
        with urllib.request.urlopen(endpoint, timeout=1) as response:
            reachable = response.status < 500
    except urllib.error.HTTPError as error:
        reachable = error.code < 500
    except (OSError, urllib.error.URLError):
        pass
    return {
        "project_repository": {"path": str(repository), "readable": repository.is_dir()},
        "task_workspaces": {
            "path": str(workspaces),
            "writable": workspaces.is_dir() and os.access(workspaces, os.W_OK),
        },
        "codex_authentication": {
            "path": str(codex_home),
            "available": (codex_home / "auth.json").is_file(),
        },
        "project_containers": {
            "network": os.environ.get("PROJECT_CONTAINER_NETWORK", "coordination-net"),
            "example_endpoint": endpoint,
            "reachable": reachable,
        },
    }
