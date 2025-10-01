include .env
export

VERSION := $(shell node -p -e "require('./package.json').version")
DOCKER_IMAGE_NAME = $(shell node -p -e "require('./package.json').name.split('/')[1]")
DOCKER_IMAGE_URL = ${DOCKER_REGISTRY_URL}/${DOCKER_IMAGE_NAME}

build.local:
	docker buildx build -t ${DOCKER_IMAGE_NAME}:latest . --label "version=v${VERSION}-local"

run.local:
	docker run --rm --name ${DOCKER_IMAGE_NAME} \
	--env-file .env \
	-p 3000:3000 ${DOCKER_IMAGE_NAME}:latest

test.local:
	docker run -i --rm --name ${DOCKER_IMAGE_NAME} \
	--env-file .env \
	${DOCKER_IMAGE_NAME}:latest \
	--test

build.latest:
	docker buildx build --pull --push \
	--platform linux/amd64 \
	-t ${DOCKER_IMAGE_URL}:latest \
	-t ${DOCKER_IMAGE_URL}:${VERSION} \
	. --label "version=v${VERSION}"

.PHONY: test
