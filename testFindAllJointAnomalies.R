library(jsonlite)
library(dbscan)
file <-
  "c:/Users/usuario/Repos/beca-dit/storedData/comillas/comillas_week_inactive.csv"
configFile <-
  "c:/Users/usuario/Repos/beca-dit/storedData/comillas/config.dharma"

config <- fromJSON(configFile)
names = config$names
dataInFile <- read.csv(file, header = FALSE, col.names = names)
reducedDataSet <- dataInFile
types = config$types
times = config$times
areThereAnoms <- matrix(nrow = length(times), ncol = length(times), dimnames = list(names, names))
areThereAnoms[, ] <- FALSE
for (name in names) {
  if (times[name] != "Not a timestamp") {
    var1 = name
    if (types[var1] == "numerical") {
      if (sd(reducedDataSet[, var1]) == 0) {
        reducedDataSet[, var1] <- 1
      } else{
        normalizedvar1 <-
          (reducedDataSet[, var1] - min(reducedDataSet[, var1])) / (max(reducedDataSet[, var1]) - min(reducedDataSet[, var1]))
        reducedDataSet[, var1] <- normalizedvar1
      }
      minPts <- 3
      others <- names[!(names == var1)]
      
      clusters <- reducedDataSet[, others]
      var2 <- "temp"
      for (var2 in others) {
        if (types[var2] == "numerical") {
          if (var(reducedDataSet[, var2]) == 0) {
            normalizedvar2 <-  matrix(1, 1, length(reducedDataSet[, var2]))[1, ]
          } else{
            normalizedvar2 <-
              (reducedDataSet[, var2] - min(reducedDataSet[, var2])) / (max(reducedDataSet[, var2]) - min(reducedDataSet[, var2]))
          }
          reducedDataSet[, var2] <- normalizedvar2
          eps <-
            sqrt((sd(reducedDataSet[, var1])) ^ 2 + (sd(reducedDataSet[, var2])) ^ 2) / 5.5
          clusters[var2] <-
            dbscan(reducedDataSet[, c(var1, var2)], eps, minPts, borderPoints = FALSE)$cluster
          areThereAnoms[var1, var2] <- sum(clusters[var2] == 0)
        }
      }
      
      #clusters <- optics(reducedDataSet, eps, minPts, eps)$cluster
      anomaliesByRows <-
        apply(clusters, 1, function(x)
          sum(x == 0, na.rm = TRUE))
      anomaliesByCols <-
        apply(clusters, 2, function(x)
          sum(x == 0, na.rm = TRUE))
    }
  }
}